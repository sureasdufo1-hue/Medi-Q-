import { SetMetadata } from "@nestjs/common";
import { PUBLIC_ROUTE_METADATA } from "./authentication.tokens.js";

export function PublicRoute(): MethodDecorator {
  return SetMetadata(PUBLIC_ROUTE_METADATA, true);
}
