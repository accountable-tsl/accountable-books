import { z } from "zod";

export const logoUploadParams = z.object({
  file: z.instanceof(Buffer),
  originalFilename: z.string(),
  mimeType: z.string(),
  companyId: z.string().min(1, "Company ID is required"),
});

export type LogoUploadParams = z.infer<typeof logoUploadParams>;

export const objectTypes = ["logos"] as const; //"profile_avatar", "document"
export type ObjectType = (typeof objectTypes)[number];

export interface UploadRequestBody {
  objectType: ObjectType;
  companyId?: string;
  userId?: string;
  [key: string]: any;
}
