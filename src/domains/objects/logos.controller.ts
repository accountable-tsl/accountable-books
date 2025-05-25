import { Request, Response } from "express";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { getSignedLogoUrl, removeLogo, uploadLogo } from "./logos.model";
import { randomUUID } from "crypto";

export async function uploadLogoController(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse("No file uploaded"));
    }
    const { companyId } = req.body;
    if (!companyId) {
      return res.status(400).json(errorResponse("Company ID required"));
    }
    // Validate file size (500KB–1MB)
    if (req.file.size > 1024 * 1024) {
      return res.status(400).json(errorResponse("File size exceeds 1MB"));
    }

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res
        .status(400)
        .json(
          errorResponse("Unsupported file type, upload PNG, JPEG, WEBP or SVG")
        );
    }

    const file = req.file.buffer;
    const uploadResult = await uploadLogo({
      file,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      companyId,
    });

    console.log(uploadResult);

    if (!uploadResult.success || !uploadResult.data) {
      return res
        .status(500)
        .json(errorResponse(uploadResult.message || "Failed to store logo"));
    }
    const signedUrlResult = await getSignedLogoUrl(uploadResult.data);
    if (!signedUrlResult.success || !signedUrlResult.data) {
      return res
        .status(500)
        .json(
          errorResponse(
            signedUrlResult.message || "Failed to generate access URL"
          )
        );
    }

    return res.status(200).json(
      successResponse("Logo uploaded", {
        url: signedUrlResult.data,
        key: uploadResult.data,
      })
    );
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json(errorResponse(`Upload failed - ${error.message}`));
  }
}

export async function removeLogoController(req: Request, res: Response) {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json(errorResponse("Key required"));
    }

    const removeResult = await removeLogo(key);
    if (!removeResult.success) {
      return res
        .status(500)
        .json(errorResponse(removeResult.message || "Failed to remove logo"));
    }

    return res.status(200).json(successResponse("Logo removed", null));
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json(errorResponse(`Remove failed - ${error.message}`));
  }
}

export async function signedLogoUrlController(req: Request, res: Response) {
  try {
    const { key } = req.query;
    if (typeof key !== "string") {
      return res.status(400).json(errorResponse("Key required"));
    }

    const signedUrlResult = await getSignedLogoUrl(key);
    if (!signedUrlResult.success || !signedUrlResult.data) {
      return res
        .status(500)
        .json(
          errorResponse(
            signedUrlResult.message || "Failed to generate signed URL"
          )
        );
    }

    return res
      .status(200)
      .json(successResponse("Signed URL generated", signedUrlResult.data));
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json(errorResponse(`Signed URL generation failed - ${error.message}`));
  }
}
