import {
    ITensor,
    TensorArrayData,
    TensorImpl,
    TensorJsonData,
} from "./tensor_if";
import { Device, DeviceType, Deviceish } from "./device";
import { getDevice } from "./devices";
import { Shape } from "./shape";
import { ones } from "./factories";
import { Dtype } from "./dtype";
import { IDevice } from "./device_if";
import { add_, mm, sum, t } from "./ops";
import { UntypedStorage } from "./storage";

export type FunctionInput = Tensor | number | boolean | string;
export type GradientFunctionOutput = Tensor | null;

export class GradientFunctionContext {
    needsInputGradient: boolean[];
    inputsWithGradient: (Tensor | null)[];
    savedTensors: Tensor[] = [];
    constructor(inputs: FunctionInput[]) {
        this.needsInputGradient = inputs.map(
            (input) => input instanceof Tensor && input.requiresGrad
        );
        this.inputsWithGradient = inputs.map((input) =>
            input instanceof Tensor && input.requiresGrad ? input : null
        );
    }
    saveForBackward(...tensors: Tensor[]) {
        this.savedTensors = tensors;
    }
}

export type GradientFunction = (
    ctx: GradientFunctionContext,
    output: Tensor
) => (Tensor | null)[];

export class Tensor implements ITensor {
    private _impl: TensorImpl;
    private _requiresGrad: boolean = false;
    private _gradFunc: GradientFunction | null;
    private _gradCtx: GradientFunctionContext | null;
    private _grad: Tensor | null = null;

    get impl(): TensorImpl {
        return this._impl;
    }

    get storage(): UntypedStorage {
        return this._impl.storage;
    }
    get dtype(): Dtype {
        return this._impl.dtype;
    }
    get shape(): Shape {
        return this._impl.shape;
    }
    get device(): IDevice {
        return this._impl.device;
    }

    get(...indices: number[]): number | ITensor {
        return this._impl.get(...indices);
    }

    get requiresGrad(): boolean {
        return this._requiresGrad;
    }
    set requiresGrad(value: boolean) {
        if (this._gradFunc) {
            throw new Error(
                "You can only change requiresGrad flags of leaf variables. If you want to use a computed variable in a subgraph that doesn't require differentiation use valueNoGrad = value.detach()."
            );
        }
        this._requiresGrad = value;
    }
    get gradFunc(): GradientFunction | null {
        return this._gradFunc;
    }
    get grad(): Tensor | null {
        return this._grad;
    }

    constructor(
        data: TensorArrayData | TensorJsonData | TensorImpl | null = null,
        dtype: Dtype = "float32",
        device: Deviceish | null = null,
        requiresGrad: boolean = false
    ) {
        if (data instanceof TensorImpl) {
            this._impl = data;
        } else if (data === null) {
            this._impl = getDevice(device).tensor(data, dtype);
        } else if (data instanceof Array) {
            this._impl = getDevice(device).tensor(data, dtype);
        } else if (data.hasOwnProperty("data")) {
            const jdata = data as TensorJsonData;
            if (jdata.data instanceof TensorImpl) {
                this._impl = jdata.data;
            } else {
                dtype = dtype || jdata.dtype;
                device = device || jdata.device || null;
                requiresGrad = requiresGrad || jdata.requiresGrad || false;
                this._impl = getDevice(device).tensor(jdata.data, dtype);
            }
        }
        else {
            throw new Error("Invalid data type for Tensor constructor. Expected an array of values or a json object with a 'data' property.");
        }
        this._requiresGrad = requiresGrad;
        this._gradFunc = null;
        this._gradCtx = null;
        this._grad = null;
    }

    get [Symbol.toStringTag]() {
        return "Tensor";
    }
    toString(options?: {}): string {
        let rg = this.requiresGrad ? ", requiresGrad=true" : "";
        if (this._gradFunc) {
            rg = ", gradFunc";
        }
        return `tensor([${this.shape}], ${this.dtype}${rg})`;
    }
    async toArrayAsync(): Promise<TensorArrayData> {
        await this._impl.storage.mapAsync(GPUMapMode.READ);
        const data = this._impl.getTypedArray();
        const shape = this._impl.shape;
        const strides = this._impl.strides;
        const index: number[] = [];
        return readArray(index);
        function readArray(index: number[]): TensorArrayData {
            const dim = index.length;
            // console.log("Read array: ", index, "dim=", dim);
            if (dim == shape.length - 1) {
                const offset = index.reduce((acc, cur, i) => acc + cur * strides[i], 0);
                // console.log("offset=", offset);
                const length = shape[dim];
                // console.log("length=", length);
                const subarray = data.subarray(offset, offset + length);
                // console.log("subarray=", subarray);
                const ar = Array.from(subarray);
                // console.log("ar=", ar);
                return ar;
            }
            else {
                const result: TensorArrayData = [];
                for (let i = 0; i < shape[dim]; i++) {
                    index.push(i);
                    result.push(readArray(index));
                    index.pop();
                }
                return result;
            }
        }
    }

    detach(): Tensor {
        if (this._requiresGrad || this._gradFunc) {
            return new Tensor({data:this._impl, dtype:this.dtype, requiresGrad:false});
        }
        return this;
    }

    setGradientFunction(
        ctx: GradientFunctionContext,
        gradFunc: GradientFunction
    ): void {
        this._gradFunc = gradFunc;
        this._gradCtx = ctx;
        this._requiresGrad = true;
    }

    backward(gradient?: Tensor): void {
        const grad = gradient || ones(1);

        if (this._grad) {
            this._grad.add_(grad);
        } else {
            this._grad = grad;
        }
        if (!this._gradFunc || !this._gradCtx) {
            return;
        }
        // console.log("GRADIENT OF " + this + " IS " + grad + "")
        const grads = this._gradFunc(this._gradCtx, grad);
        // console.log(grads)
        const inputs = this._gradCtx.inputsWithGradient;
        // console.log(inputs);
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            if (input === null) {
                continue;
            }
            const grad = grads[i];
            if (grad) {
                input.backward(grad);
            } else {
                throw new Error(
                    "Gradient function did not return a gradient for input " + i
                );
            }
        }
    }

    add_(other: Tensor): Tensor {
        return add_(this, other);
    }
    /** Returns a new view of this tensor with singleton dimensions expanded to a larger size.
    Passing -1 as the size for a dimension means not changing the size of that dimension.
    Tensor can be also expanded to a larger number of dimensions, and the new ones will be appended at the front. For the new dimensions, the size cannot be set to -1.
    Expanding a tensor does not allocate new memory, but only creates a new view on the existing tensor where a dimension of size one is expanded to a larger size by setting the stride to 0. Any dimension of size 1 can be expanded to an arbitrary value without allocating new memory. */
    expand(shape: Shape): Tensor {
        return new Tensor(this.impl.expand(shape));
    }
    mm(other: Tensor): Tensor {
        return mm(this, other);
    }
    sum(axis: number | null = null): Tensor {
        return sum(this, axis);
    }
    t(): Tensor {
        return t(this);
    }
}
