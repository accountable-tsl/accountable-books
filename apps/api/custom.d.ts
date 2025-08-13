import { Company } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      company?: Company;
    }
  }
}
