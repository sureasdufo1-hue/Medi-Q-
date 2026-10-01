export const authorizationEffects = ["ALLOW", "DENY"] as const;

export type AuthorizationEffect = (typeof authorizationEffects)[number];
