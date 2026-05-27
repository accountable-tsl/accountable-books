import path from 'path';
import { fileURLToPath, URL } from 'url';

export function getDirname(metaUrl: string) {
  const __filename = fileURLToPath(new URL(metaUrl));
  const __dirname = path.dirname(__filename);

  return __dirname;
}
