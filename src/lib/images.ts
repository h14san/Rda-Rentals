import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Picking and compressing photos, shared by listing photos and verification
 * documents. Each caller picks its own size budget: listing photos are sized
 * for a phone screen, identity documents for legible small print.
 */

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

/** Opens the system picker. Returns [] if the user cancels or denies access. */
export async function pickImages(remainingSlots: number): Promise<PickedImage[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remainingSlots,
    quality: 1, // Compression happens in compressToJpeg, after resizing.
    exif: false,
  });

  if (result.canceled) return [];
  return result.assets.map((a) => ({
    uri: a.uri,
    width: a.width,
    height: a.height,
  }));
}

/** Opens the camera for a single shot. */
export async function captureImage(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;

  const a = result.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

/**
 * Resize + re-encode to JPEG, returning base64.
 *
 * base64 rather than a Blob because RN's fetch is unreliable at turning a
 * file:// URI into a Blob; reading it out of the manipulator directly avoids a
 * round trip through the filesystem. `exif: false` on both pickers also keeps
 * GPS coordinates out of every upload.
 */
export async function compressToJpeg(
  image: PickedImage,
  maxEdge: number,
  quality: number,
): Promise<string> {
  const context = ImageManipulator.manipulate(image.uri);

  // Only ever scale down, and constrain the longer edge so portrait and
  // landscape shots both end up under the same pixel budget.
  const longestEdge = Math.max(image.width, image.height);
  if (longestEdge > maxEdge) {
    const isLandscape = image.width >= image.height;
    context.resize(isLandscape ? { width: maxEdge } : { height: maxEdge });
  }

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: quality,
    format: SaveFormat.JPEG,
    base64: true,
  });

  if (!saved.base64) throw new Error('Image compression returned no data.');
  return saved.base64;
}
