import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { useMediaUrl } from '../hooks/useMediaUrl';

const MEDIA_PREFIX = 'media:';
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex, rehypeHighlight];

function MediaImage({ id, alt }: { id: string; alt?: string }) {
  const src = useMediaUrl(id);
  if (!src) return null;
  return <img src={src} alt={alt ?? ''} className="max-w-full" />;
}

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
}

export default function CardContent({ markdown, lang }: Props) {
  return (
    <div dir="auto" lang={lang ?? undefined} className="card-content" style={{ fontSize: 'calc(1rem * var(--card-scale))' }}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} urlTransform={urlTransform} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
