import api from "@/lib/axios";

export const fetchLogoUrl = async (key: string) => {
  try {
    const response = await api.get(`/objects/logos/signed-url?key=${key}`);
    const { success, data } = response.data;
    if (success && data) {
      return data;
    }
    throw new Error("Signed URL failed");
  } catch (err: any) {
    console.error("Signed URL error:", err);
    return null;
  }
};

export const uploadToObjectStorage = async (file: File, companyId: string) => {
  if (!file || !companyId) return;

  const formData = new FormData();
  formData.append("file", file);

  if (companyId) {
    formData.append("companyId", companyId);
  }

  setIsUploading(true);
  setError(null);

  try {
    const response = await api.post("/api/logos/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    console.log(response);
    const { success, data } = response.data;
    if (success && data?.url && data?.key) {
      setUploadedUrl(data.url);
      setImage(data.url);
      setImageKey(data.key);
      if (onImageUpload) {
        onImageUpload({ url: data.url, key: data.key });
      }
    } else {
      throw new Error("Upload failed");
    }
  } catch (err: any) {
    setError("Failed to upload image");
    console.error("Upload error:", err);
  } finally {
    setIsUploading(false);
  }
};

export const removeImage = async (key: string) => {
  setIsUploading(true);
  try {
    if (key) {
      const response = await api.delete("/api/logos/delete", {
        data: {
          key,
        },
      });

      console.log(response);
      const { success, message } = response.data;
      if (!success) {
        setError(message || "Failed to remove image");
      }

      setUploadedUrl(null);
      setImage(null);
      setImageKey(null);
    }

    setError(null);
    if (onImageChange) {
      onImageChange(null);
    }
  } catch (err: any) {
    setError("Failed to remove image");
    console.error("Remove error:", err);
  } finally {
    setIsUploading(false);
  }
};
