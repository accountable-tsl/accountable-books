import { Request, Response, NextFunction } from "express";

export function basicAuth(username: string, password: string) {
  return function (req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization || "";
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme !== "Basic" || !encoded) {
      return unauthorized(res);
    }

    const decoded = Buffer.from(encoded, "base64").toString();
    const [inputUser, inputPass] = decoded.split(":");

    if (inputUser === username && inputPass === password) {
      return next();
    }

    return unauthorized(res);
  };
}

function unauthorized(res: Response) {
  res.setHeader("WWW-Authenticate", 'Basic realm="BullMQ Dashboard"');
  return res.status(401).send("Authentication required");
}
