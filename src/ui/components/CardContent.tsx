import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { useMediaUrl } from '../hooks/useMediaUrl';
import { strings } from '../strings';

const MEDIA_PREFIX = 'media:';
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex, rehypeHighlight];

function MediaImage({ id, alt }: { id: string; alt?: string }) {
  const { url: src, status } = useMediaUrl(id);
  if (status === 'missing') {
    return (
      <span className="inline-block rounded border border-dashed border-slate-400 px-2 py-1 text-sm text-slate-600 dark:text-slate-400">
        {alt ? `${strings.common.imageNotFound} (${alt})` : strings.common.imageNotFound}
      </span>
    );
  }
  if (!src) return <span aria-hidden className="inline-block h-24 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />;
  return <img src={src} alt={alt ?? ''} className="max-w-full" />;
}

/** For untrusted content: every image, local or remote, becomes a placeholder and nothing is fetched. */
const placeholderComponents: Components = {
  img: () => <span className="inline-block rounded border border-dashed border-slate-400 px-2 py-1 text-sm">{strings.sharePreview.imagePlaceholder}</span>,
};

const components: Components = {
  img: ({ src, alt }) =>
    typeof src === 'string' && src.startsWith(MEDIA_PREFIX) ? (
      <MediaImage id={src.slice(MEDIA_PREFIX.length)} alt={alt} />
    ) : (
      <img src={src} alt={alt ?? ''} className="max-w-full" />
    ),
};

/** Keeps `media:<id>` for our own resolver; everything else goes through react-markdown's safe default. */
const urlTransform = (url: string) => (url.startsWith(MEDIA_PREFIX) ? url : defaultUrlTransform(url));

interface Props {
  markdown: string;
  lang?: string | null;
  /** Replace all images with placeholders (used for previews of untrusted content). */
  noImages?: boolean;
}

export default function CardContent({ markdown, lang, noImages }: Props) {
  return (
    <div dir="auto" lang={lang ?? undefined} className="card-content" style={{ fontSize: 'calc(1rem * var(--card-scale))' }}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} urlTransform={urlTransform} components={noImages ? placeholderComponents : components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
