import { type NextFunction, type Response } from 'express';
import { knexClient } from '../../db/knexClient.js';
import type { AuthRequest } from '../../features/auth/auth.types.js';

interface SubdomainRequest extends AuthRequest {
  subdomain?: string;
  firmId?: string;
}

export async function subdomain(
  req: SubdomainRequest,
  res: Response,
  next: NextFunction,
) {
  console.log('req.headers.host', req.headers);
  const hostname = (req.headers.host || '').split(':')[0];
  const subdomain = hostname.split('.')[0];
  const baseDomain = getBaseDomain(hostname);

  // const reservedSubdomains = ["api", "www", "admin"];
  // if (reservedSubdomains.includes(subdomain)) {
  //   return next(); // don't check for firm slug
  // }

  console.log('baseDomain', baseDomain);
  console.log('hostname', hostname);

  const firmSlug = req.company?.assignedFirmSlug;

  if (hostname === baseDomain || hostname === `www.${baseDomain}`) {
    if (firmSlug) {
      return res.redirect(`https://${firmSlug}.${baseDomain}`);
    }
    return res.redirect(`https://www.${baseDomain}`);
  }

  req.subdomain = subdomain;
  console.log('subdomain', subdomain);
  const firm = await knexClient('accounting_firms_meta')
    .where('slug', subdomain)
    .select('id')
    .first();

  if (!firm) {
    return res.status(404).send('Firm not found');
  }

  req.firmId = firm.id;

  next();
}

function getBaseDomain(hostname: string): string {
  const parts = hostname.split('.');
  return parts.slice(-2).join('.');
}
