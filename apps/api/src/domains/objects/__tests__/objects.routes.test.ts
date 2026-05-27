import { describe, expect, it } from 'vitest';

import router from '../objects.routes.js';

describe('objects routes', () => {
  it('protects upload-intent creation with auth, company access, and purpose-aware gating', () => {
    const uploadIntentLayer = (router as any).stack.find(
      (layer: any) =>
        layer.route?.path === '/:companyId/files/upload-intents' &&
        layer.route.methods?.post,
    );

    expect(uploadIntentLayer).toBeTruthy();

    const middlewareNames = uploadIntentLayer.route.stack.map(
      (layer: any) => layer.name,
    );

    expect(middlewareNames).toEqual([
      'verifyAccessToken',
      'checkCompanyId',
      'requireUploadIntentAccess',
      'createUploadIntentController',
    ]);
  });

  it('protects private file download urls with auth and company access', () => {
    const downloadLayer = (router as any).stack.find(
      (layer: any) =>
        layer.route?.path === '/:companyId/files/url/download' &&
        layer.route.methods?.get,
    );

    expect(downloadLayer).toBeTruthy();

    const middlewareNames = downloadLayer.route.stack.map(
      (layer: any) => layer.name,
    );

    expect(middlewareNames).toEqual([
      'verifyAccessToken',
      'checkCompanyId',
      'getPrivateFileDownloadUrlController',
    ]);
  });

  it('protects upload finalize with auth, company access, and purpose-aware gating', () => {
    const finalizeLayer = (router as any).stack.find(
      (layer: any) =>
        layer.route?.path === '/:companyId/files/finalize' &&
        layer.route.methods?.post,
    );

    expect(finalizeLayer).toBeTruthy();

    const middlewareNames = finalizeLayer.route.stack.map(
      (layer: any) => layer.name,
    );

    expect(middlewareNames).toEqual([
      'verifyAccessToken',
      'checkCompanyId',
      'requireFinalizeUploadIntentAccess',
      'finalizeUploadIntentController',
    ]);
  });

  it('protects company-logo removal with auth, company access, and logo mutation checks', () => {
    const deleteLayer = (router as any).stack.find(
      (layer: any) =>
        layer.route?.path === '/:companyId/company-logo' &&
        layer.route.methods?.delete,
    );

    expect(deleteLayer).toBeTruthy();

    const middlewareNames = deleteLayer.route.stack.map(
      (layer: any) => layer.name,
    );

    expect(middlewareNames).toEqual([
      'verifyAccessToken',
      'checkCompanyId',
      'requireCompanyLogoMutationAccess',
      'deleteCompanyLogoController',
    ]);
  });
});
