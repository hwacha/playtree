export type Kleene = boolean | undefined

export const definitely = (condition : Kleene) : boolean => condition ?? false;
export const maybe = (condition : Kleene) : boolean => condition ?? true;
export const definitelyNot = (condition : Kleene) : boolean => !maybe(condition);
export const maybeNot = (condition : Kleene) : boolean => !definitely(condition);
