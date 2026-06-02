import {AppError, ValidationError} from "../shared/errors/AppError.js";
import {ZodError} from "zod";

export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ValidationError) {
    return res.status(422).json({
      status: "error",
      message: err.message,
      fields: err.fields,
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
    });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      status: "error",
      message: "Validation failed",
      fields: err.flatten().fieldErrors,
    });
  }

  // Unhandled — don't leak stack traces to client
  console.error("Unhandled error:", err);

  return res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
};
