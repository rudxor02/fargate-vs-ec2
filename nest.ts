import "reflect-metadata";

export interface Type<T = any> extends Function {
  new (...args: any[]): T;
}

export enum Scope {
  DEFAULT,
  TRANSIENT,
  REQUEST,
}

export interface ScopeOptions {
  scope?: Scope;
  durable?: boolean;
}

export type InjectableOptions = ScopeOptions;

export function Injectable(options?: InjectableOptions): ClassDecorator {
  return (target: object) => {
    console.log(Reflect.getMetadata(PARAMTYPES_METADATA, target));
    Reflect.defineMetadata(INJECTABLE_WATERMARK, true, target);
    Reflect.defineMetadata(SCOPE_OPTIONS_METADATA, options, target);

    console.log(Reflect.getMetadata(PARAMTYPES_METADATA, target));
  };
}

export function InjectableTest(): ClassDecorator {
  return (target: object) => {
    console.log(Reflect.getMetadata(PARAMTYPES_METADATA, target));
  };
}

export function EmptyClass(): ClassDecorator {
  return (target: object) => {};
}

export function EmptyParam(): ParameterDecorator {
  return (target: object, propertyKey: string, index: number) => {
    console.log(Reflect.getMetadataKeys(target.constructor));
    console.log(Reflect.getMetadataKeys(target));
  };
}

export const PROPERTY_DEPS_METADATA = "self:properties_metadata";
export const PARAMTYPES_METADATA = "design:paramtypes";
export const SCOPE_OPTIONS_METADATA = "scope:options";
export const INJECTABLE_WATERMARK = "__injectable__";
export const SELF_DECLARED_DEPS_METADATA = "self:paramtypes";
