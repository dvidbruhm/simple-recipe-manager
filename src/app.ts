import type { Context, Hono } from "hono";

export interface AppVariables {
	userId: number;
}

export type App = Hono<{ Variables: AppVariables }>;
export type Ctx = Context<{ Variables: AppVariables }>;
