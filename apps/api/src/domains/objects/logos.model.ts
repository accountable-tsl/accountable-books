import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "../../config/env.js";
import {
  AppError,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils.js";
import type { ApiResponse } from "../../core/types/api.types.js";
import { createHash, randomUUID } from "crypto";
import { type LogoUploadParams } from "./objects.types.js";
import axios from "axios";

if (!ENV.B2_LOGOS_KEY_ID || !ENV.B2_LOGOS_APPLICATION_KEY) {
  throw new AppError("Missing Backblaze logos credentials", null, true);
}

async function authorizeAccount() {
  const encoded = Buffer.from(
    `${ENV.B2_LOGOS_KEY_ID}:${ENV.B2_LOGOS_APPLICATION_KEY}`,
  ).toString("base64");

  const response = await axios.get(
    "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
    {
      headers: {
        Authorization: `Basic ${encoded}`,
      },
    },
  );

  return response.data;
}

async function getUploadUrl(apiUrl: string, authToken: string) {
  const response = await axios.post(
    `${apiUrl}/b2api/v2/b2_get_upload_url`,
    {
      bucketId: ENV.B2_LOGOS_BUCKET_ID || "e12e36dfef31f9c6906a0813",
    },
    {
      headers: {
        Authorization: authToken,
      },
    },
  );

  return response.data;
}

export async function uploadLogo({
  file,
  originalFilename,
  mimeType,
  companyId,
}: LogoUploadParams): Promise<ApiResponse<string>> {
  const { authorizationToken, apiUrl } = await authorizeAccount();
  const { uploadUrl, authorizationToken: uploadToken } = await getUploadUrl(
    apiUrl,
    authorizationToken,
  );

  const sha1 = createHash("sha1").update(file).digest("hex");
  const filename = `${companyId}-${randomUUID()}.${originalFilename.split(".").pop()}`;

  const key = filename;
  const bucketName = ENV.B2_LOGOS_BUCKET_NAME || "accountable-logos";
  const url = `https://f002.backblazeb2.com/file/${bucketName}/${key}`;

  const res = await axios.post(uploadUrl, file, {
    headers: {
      Authorization: uploadToken,
      "X-Bz-File-Name": encodeURIComponent(key),
      "Content-Type": mimeType,
      "Content-Length": file.length,
      "X-Bz-Content-Sha1": sha1,
      "X-Bz-Info-b2-content-disposition": "inline",
    },
  });

  return successResponse("Logo uploaded successfully", key);
}

export async function getSignedLogoUrl(
  key: string,
): Promise<ApiResponse<string>> {
  try {
    const { authorizationToken, apiUrl } = await authorizeAccount();
    const response = await axios.post(
      `${apiUrl}/b2api/v2/b2_get_download_authorization`,
      {
        bucketId: ENV.B2_LOGOS_BUCKET_ID || "e12e36dfef31f9c6906a0813",
        fileNamePrefix: key,
        validDurationInSeconds: 3600,
      },
      {
        headers: {
          Authorization: authorizationToken,
        },
      },
    );

    const bucketName = ENV.B2_LOGOS_BUCKET_NAME || "accountable-logos";
    const url = `https://f002.backblazeb2.com/file/${bucketName}/${key}`;
    return successResponse("Logo URL generated", url);
  } catch (error: any) {
    return errorResponse(
      "Failed to generate signed URL",
      error.message || error.toString(),
    );
  }
}

export async function removeLogo(key: string): Promise<ApiResponse<void>> {
  try {
    const { authorizationToken, apiUrl } = await authorizeAccount();
    const fileInfo = await axios.post(
      `${apiUrl}/b2api/v2/b2_list_file_names`,
      {
        bucketId: ENV.B2_LOGOS_BUCKET_ID || "e12e36dfef31f9c6906a0813",
        startFileName: key,
        maxFileCount: 1,
      },
      {
        headers: {
          Authorization: authorizationToken,
        },
      },
    );

    const file = fileInfo.data.files.find((f: any) => f.fileName === key);
    if (!file) {
      return errorResponse("File not found", null);
    }

    await axios.post(
      `${apiUrl}/b2api/v2/b2_delete_file_version`,
      {
        fileName: key,
        fileId: file.fileId,
      },
      {
        headers: {
          Authorization: authorizationToken,
        },
      },
    );

    return successResponse("Logo deleted successfully", null);
  } catch (error: any) {
    return errorResponse(
      "Failed to delete logo",
      error.message || error.toString(),
    );
  }
}
