import type { Tensor } from "./tensor";
import { TensorBase } from "./tensor_base";

export type FunctionInput = Tensor | number | boolean | string | undefined;
export type GradientFunctionOutput = Tensor | null;

function isTensor(input: FunctionInput): input is Tensor {
    return input instanceof TensorBase;
}

export class GradientContext {
    [key: string]: any;
    needsInputGradient: boolean[];
    inputsWithGradient: (Tensor | null)[];
    savedTensors: Tensor[] = [];
    constructor(inputs: FunctionInput[]) {
        this.needsInputGradient = inputs.map(
            (input) => isTensor(input) && input.requiresGrad
        );
        this.inputsWithGradient = inputs.map((input) =>
            isTensor(input) && input.requiresGrad ? input : null
        );
    }
    saveForBackward(...tensors: Tensor[]) {
        this.savedTensors = tensors;
    }
}

export type GradientFunction = (
    ctx: GradientContext,
    output: Tensor
) => (Tensor | null)[];

export interface IAutoFunction {
    forward(inputs: FunctionInput[]): Tensor;
    apply(...inputs: FunctionInput[]): Tensor;
    backward(ctx: GradientContext, outputGrad: Tensor): GradientFunctionOutput[];
}

export class AutoFunction {
    static forward(inputs: FunctionInput[]): Tensor {
        throw new Error("Do not call forward on AutoFunction directly.");
    }
    static setupContext(
        ctx: GradientContext,
        inputs: FunctionInput[],
        output: Tensor
    ): void {
        throw new Error("Do not call setupContext on AutoFunction directly.");
    }
    static backward(
        ctx: GradientContext,
        outputGrad: Tensor
    ): GradientFunctionOutput[] {
        throw new Error("Do not call backward on AutoFunction directly.");
    }
    static apply(...inputs: FunctionInput[]): Tensor {
        const ctx = new GradientContext(inputs);
        const detachedInputs = inputs.map((input) =>
            isTensor(input) ? input.detach() : input
        );
        const output = this.forward(detachedInputs);
        this.setupContext(ctx, detachedInputs, output);
        output.setGradientFunction(ctx, this.backward);
        return output;
    }
}

export function shouldCreateGradient(...inputs: Tensor[]): boolean {
    for (const input of inputs) {
        if (input.requiresGrad) {
            return true;
        }
    }
    return false;
}
