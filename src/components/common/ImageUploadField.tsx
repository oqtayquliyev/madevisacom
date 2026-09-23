import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { uploadListingImage } from '@/lib/uploadImage';

export function ImageUploadField({
  userId,
  value,
  onChange,
  label = 'Logo / cover image (optional)',
}: {
  userId: string;
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    const result = await uploadListingImage(file, userId);
    setUploading(false);
    if (result.url) onChange(result.url);
    else setError(result.error ?? 'Upload failed — please try again.');
  };

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>

      {value ? (
        <div className="flex items-center gap-3">
          <img src={value} alt="" className="h-16 w-16 rounded-lg border border-ink-200 object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-rose-600"
          >
            <X className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-ink-200 text-ink-400 hover:border-brand-300 hover:text-brand-600 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span className="text-xs font-medium">{uploading ? 'Uploading…' : 'Click to upload an image'}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
