import * as functions from "./functions";
import { Tensor } from "./tensor";
import { shouldCreateGradient } from "./autograd";
export function abs(input: Tensor): Tensor {
    if (shouldCreateGradient(input)) {
        return functions.AbsFunction.apply(input);
    }
    return new Tensor(input.impl.abs());
}
export function acos(input: Tensor): Tensor {
    if (shouldCreateGradient(input)) {
        return functions.AcosFunction.apply(input);
    }
    return new Tensor(input.impl.acos());
}
export function acosh(input: Tensor): Tensor {
    if (shouldCreateGradient(input)) {
        return functions.AcoshFunction.apply(input);
    }
    return new Tensor(input.impl.acosh());
}
export function add(input: Tensor, other: Tensor, alpha?: number): Tensor {
    if (input.shape.length !== other.shape.length) {
        throw new Error(`Shape dimensions of add must match. Got ${input.shape} and ${other.shape}`);
    }
    if (shouldCreateGradient(input, other)) {
        return functions.AddFunction.apply(input, other);
    }
    return new Tensor(input.impl.add(other.impl, alpha));
}
export function asin(input: Tensor): Tensor {
    if (shouldCreateGradient(input)) {
        return functions.AsinFunction.apply(input);
    }
    return new Tensor(input.impl.asin());
}
export function asinh(input: Tensor): Tensor {
    if (shouldCreateGradient(input)) {
        return functions.AsinhFunction.apply(input);
    }
    return new Tensor(input.impl.asinh());
}
export function atan(input: Tensor): Tensor {
    if (shouldCreateGradient(input)) {
        return functions.AtanFunction.apply(input);
    }
    return new Tensor(input.impl.atan());
}
export function atan2(input: Tensor, other: Tensor): Tensor {
    if (input.shape.length !== other.shape.length) {
        throw new Error(`Shape dimensions of atan2 must match. Got ${input.shape} and ${other.shape}`);
    }
    if (shouldCreateGradient(input, other)) {
        return functions.Atan2Function.apply(input, other);
    }
    return new Tensor(input.impl.atan2(other.impl));
}
export function sub(input: Tensor, other: Tensor, alpha?: number): Tensor {
    if (input.shape.length !== other.shape.length) {
        throw new Error(`Shape dimensions of sub must match. Got ${input.shape} and ${other.shape}`);
    }
    if (shouldCreateGradient(input, other)) {
        return functions.SubFunction.apply(input, other);
    }
    return new Tensor(input.impl.sub(other.impl, alpha));
}