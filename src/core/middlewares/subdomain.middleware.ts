import { NextFunction, Request, Response } from "express";
import { FRONTEND_URL } from "../..";
import knexClient from "../../../knexClient";

export async function subdomain(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const host = req.headers.host || "";
  const parts = host.split(".");
  const isDev = process.env.NODE_ENV === "development";
  const baseDomain = isDev ? "lvh.me:5173" : "getaccountable.com";

  if (parts.length === (isDev ? 2 : 1) || host === baseDomain) {
    return res.redirect("http://www.getaccountable.com");
  }

  const firm = await knexClient("accounting_firms").select("id");
}
