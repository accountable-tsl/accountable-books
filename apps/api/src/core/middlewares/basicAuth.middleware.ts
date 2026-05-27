import { createHash, timingSafeEqual } from 'crypto';
import { type NextFunction, type Request, type Response } from 'express';

function constantTimeCompare(a: string, b: string): boolean {
  const hash = (buf: Buffer) => createHash('sha256').update(buf).digest();
  const ah = hash(Buffer.from(a, 'utf8'));
  const bh = hash(Buffer.from(b, 'utf8'));
  return timingSafeEqual(ah, bh);
}

export function basicAuth(username: string, password: string) {
  return function (req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization || '';
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme !== 'Basic' || !encoded) {
      return unauthorized(res);
    }

    const decoded = Buffer.from(encoded, 'base64').toString();
    const [inputUser, inputPass] = decoded.split(':');

    if (
      constantTimeCompare(inputUser, username) &&
      constantTimeCompare(inputPass, password)
    ) {
      return next();
    }

    return unauthorized(res);
  };
}

function unauthorized(res: Response) {
  res.setHeader('WWW-Authenticate', 'Basic realm="BullMQ Dashboard"');
  return res.status(401).send('Authentication required');
}
