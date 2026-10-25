import { useQuery } from '@tanstack/react-query';
import { atlasQuery } from '@/lib/queries';
import { useImage } from '@/lib/use-image';
import type { AssetFileMeta } from '@/lib/types';

/** The atlas and the image of one exported sheet: what the Details windows that do not play frames (icons, interface pieces) read. */
export function useSheet(asset: AssetFileMeta) {
  const atlasResult = useQuery(atlasQuery(asset));
  const { image, failed } = useImage(`${asset.url}?t=${asset.mtime}`);
  return { atlas: atlasResult.data, atlasError: atlasResult.error, image, failed };
}
