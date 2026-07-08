// Shared by AddIdeaModal and IdeaDocuments — reads a File into the base64
// payload the document-upload endpoints expect.
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // dataURL looks like "data:<mime>;base64,<data>" — only the part after
      // the comma is the base64 payload the server expects.
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
