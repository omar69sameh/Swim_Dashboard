import { NextResponse } from "next/server";

export const apiOk = <T>(data: T, status = 200) =>
  NextResponse.json(data, { status });

export const apiError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

export const unauthorized = () => apiError("Not authenticated", 401);
export const forbidden = () => apiError("Forbidden", 403);
export const notFound = (resource = "Resource") => apiError(`${resource} not found`, 404);
export const badRequest = (message: string) => apiError(message, 400);
export const serverError = (message: string) => apiError(message, 500);
