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
  return result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

/** Opens the camera for a single shot. */
export async function captureImage(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({ quality: 1, exif: false });
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
export async function uploadListingImages(
  userId: string,
  listingId: string,
  images: PickedImage[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < images.length; i++) {
    const base64 = await compressToJpeg(images[i]);
    // First path segment must be the uploader's id — the storage RLS policy
    // compares it against auth.uid().
    const path = `${userId}/${listingId}/${i}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('listing-images')
      .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });

    if (uploadError) throw uploadError;

    const { error: rowError } = await supabase
      .from('listing_images')
      .upsert(
        { listing_id: listingId, storage_path: path, position: i },
        { onConflict: 'listing_id,position' },
      );

    if (rowError) throw rowError;

    onProgress?.(i + 1, images.length);
  }
}

/** Flips a finished draft live. */
export async function publishListing(listingId: string): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .update({ status: 'active' })
    .eq('id', listingId);

  if (error) throw error;
}
