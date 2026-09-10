import { decode } from 'base64-arraybuffer';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { ListingRow, PropertyType } from '@/features/listings/types';
import { supabase } from '@/lib/supabase';

export const MAX_IMAGES = 8;

/**
 * Longest edge, in pixels, that an uploaded photo is resized to.
 *
 * The brief targets low-to-medium bandwidth, and a raw phone photo is 3-8 MB.
 * 1600px at quality 0.7 lands around 200-400 KB, which is indistinguishable on
 * a phone screen and roughly a tenth of the data. This is the single biggest
 * lever on whether posting a listing is usable on Rwandan mobile data.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

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
 * round trip through the filesystem.
 */
async function compressToJpeg(image: PickedImage): Promise<string> {
  const context = ImageManipulator.manipulate(image.uri);

  // Only ever scale down, and constrain the longer edge so portrait and
  // landscape shots both end up under the same pixel budget.
  const longestEdge = Math.max(image.width, image.height);
  if (longestEdge > MAX_EDGE) {
    const isLandscape = image.width >= image.height;
    context.resize(isLandscape ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });

  if (!saved.base64) throw new Error('Image compression returned no data.');
  return saved.base64;
}

export interface DraftInput {
  ownerId: string;
  title: string;
  description: string | null;
  priceRwf: number;
  propertyType: PropertyType;
  bedrooms: number | null;
  furnished: boolean;
  district: string | null;
  sector: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Creates the listing row up front, as a draft.
 *
 * Images need a listing id to be filed under, and a draft is invisible to
 * everyone but its owner (see the RLS select policy), so an abandoned post
 * leaves a hidden row rather than orphaned storage objects with nothing
 * pointing at them.
 */
export async function createDraftListing(input: DraftInput): Promise<ListingRow> {
  const { data, error } = await supabase
    .from('listings')
    .insert({
      owner_id: input.ownerId,
      title: input.title,
      description: input.description,
      price_rwf: input.priceRwf,
      property_type: input.propertyType,
      bedrooms: input.bedrooms,
      furnished: input.furnished,
      district: input.district,
      sector: input.sector,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      status: 'draft',
      is_featured: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ListingRow;
}

/**
 * Compresses and uploads each image, then records it.
 *
 * Sequential, not parallel: on a weak connection several concurrent multi-
 * hundred-KB uploads compete and all of them stall, and progress reporting
 * stops meaning anything.
 */
/**
 * Unique object name for an upload.
 *
 * Index-based names ({listingId}/0.jpg) were fine while listings were only ever
 * created, but editing breaks them: removing the first photo and adding another
 * would make the new file overwrite an existing one. Ordering is carried by the
 * `position` column, so the object name only has to be unique — never parsed.
 *
 * The first path segment must be the uploader's id; the storage RLS policy
 * compares it against auth.uid().
 */
function storagePathFor(userId: string, listingId: string): string {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${userId}/${listingId}/${unique}.jpg`;
}

/**
 * Compresses and uploads each image, then records it at `startPosition` onward.
 *
 * Sequential, not parallel: on a weak connection several concurrent multi-
 * hundred-KB uploads compete and all of them stall, and progress reporting
 * stops meaning anything.
 */
export async function uploadListingImages(
  userId: string,
  listingId: string,
  images: PickedImage[],
  onProgress?: (done: number, total: number) => void,
  startPosition = 0,
): Promise<void> {
  for (let i = 0; i < images.length; i++) {
    const base64 = await compressToJpeg(images[i]);
    const path = storagePathFor(userId, listingId);

    const { error: uploadError } = await supabase.storage
      .from('listing-images')
      .upload(path, decode(base64), { contentType: 'image/jpeg' });

    if (uploadError) throw uploadError;

    const { error: rowError } = await supabase
      .from('listing_images')
      .insert({
        listing_id: listingId,
        storage_path: path,
        position: startPosition + i,
      });

    if (rowError) throw rowError;

    onProgress?.(i + 1, images.length);
  }
}

/**
 * Removes photos from an existing listing.
 *
 * The row goes first: an orphaned storage object is invisible and costs a few
 * hundred KB, whereas a row pointing at a deleted object renders as a broken
 * image on every listing card.
 */
export async function removeListingImages(
  imageIds: string[],
  storagePaths: string[],
): Promise<void> {
  if (imageIds.length === 0) return;

  const { error } = await supabase
    .from('listing_images')
    .delete()
    .in('id', imageIds);

  if (error) throw error;

  if (storagePaths.length > 0) {
    await supabase.storage.from('listing-images').remove(storagePaths);
  }
}

/**
 * Next free position for a listing.
 *
 * Positions are append-only and may have gaps once photos are removed — that is
 * deliberate. Renumbering would collide with the unique (listing_id, position)
 * constraint partway through, and nothing depends on them being contiguous
 * because ordering is done with ORDER BY position.
 */
export async function nextImagePosition(listingId: string): Promise<number> {
  const { data, error } = await supabase
    .from('listing_images')
    .select('position')
    .eq('listing_id', listingId)
    .order('position', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.length ? data[0].position + 1 : 0;
}

/** Flips a finished draft live. */
export async function publishListing(listingId: string): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .update({ status: 'active' })
    .eq('id', listingId);

  if (error) throw error;
}
