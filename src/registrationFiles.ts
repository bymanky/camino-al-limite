export function readRegistrationFile(file: File, maxBytes: number) {
  if (!file.size || file.size > maxBytes) {
    throw new Error(`El archivo debe pesar hasta ${maxBytes / 1048576} MB.`);
  }
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
    throw new Error("Elegí un archivo PDF, JPG o PNG.");
  }
  return new Promise<{ name: string; type: string; data: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type,
      data: String(reader.result).split(",")[1],
    });
    reader.onerror = () => reject(new Error("No pudimos leer el archivo."));
    reader.readAsDataURL(file);
  });
}

export function downloadRegistrationFile(data: string, mime: string, name: string) {
  const bytes = Uint8Array.from(atob(data), (value) => value.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
