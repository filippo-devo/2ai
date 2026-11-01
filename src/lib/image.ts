import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_SIDE = 1280;

export interface PreparedImage {
  uri: string; // plik tymczasowy (cache) – zostanie skopiowany do trwałego katalogu dopiero przy zapisie posiłku
  base64: string;
  width: number;
  height: number;
}

/** Zmniejsza zdjęcie (dłuższy bok max 1280 px) i kompresuje do JPEG – szybszy upload i niższy koszt analizy. */
export async function prepareImage(uri: string, width?: number, height?: number): Promise<PreparedImage> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > MAX_SIDE) {
    ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  } else if (!width || !height) {
    ctx.resize({ width: MAX_SIDE });
  }
  const ref = await ctx.renderAsync();
  const result = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!result.base64) throw new Error('Nie udało się przygotować zdjęcia.');
  return { uri: result.uri, base64: result.base64, width: result.width, height: result.height };
}
