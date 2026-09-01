import axios from 'axios';
import * as cheerio from 'cheerio';
import { env } from '../config/env';

const BLOG_URL = 'https://oasis.security/blog';
const USER_AGENT = 'Mozilla/5.0 (compatible; IdentityHubBlogDigest/1.0; +https://github.com/)';

export interface BlogPost {
  url: string;
  title: string;
  excerpt: string;
}

// The listing page renders its most recent post first inside a `blog_main-item-link` anchor.
// No RSS feed or dated sitemap exists to use instead (both checked).
export async function fetchLatestPost(): Promise<BlogPost> {
  const { data: html } = await axios.get<string>(BLOG_URL, { headers: { 'User-Agent': USER_AGENT } });
  const $ = cheerio.load(html);
  const featured = $('.blog_main-item-link').first();
  const href = featured.attr('href');
  if (!href) {
    throw new Error('Could not find a blog post link on the Oasis Security blog listing page');
  }
  return {
    url: href.startsWith('http') ? href : `https://oasis.security${href}`,
    title: featured.find('h3').first().text().trim(),
    excerpt: featured.find('.text-style-2lines').first().text().trim(),
  };
}

export async function fetchPostBody(url: string): Promise<string> {
  const { data: html } = await axios.get<string>(url, { headers: { 'User-Agent': USER_AGENT } });
  const $ = cheerio.load(html);
  const body = $('.blog-rich-text').first().text();
  return body.replace(/\s+/g, ' ').trim();
}

/** Falls back to the listing-page excerpt (no LLM call) if OPENAI_API_KEY isn't configured. */
export async function summarize(title: string, body: string, excerpt: string): Promise<string> {
  if (!env.openaiApiKey) {
    return excerpt || body.slice(0, 500);
  }
  const { data } = await axios.post<{ choices: { message: { content: string } }[] }>(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You summarize security blog posts in 3-4 concise sentences for a security engineering audience. No preamble, just the summary.',
        },
        { role: 'user', content: `Title: ${title}\n\nContent:\n${body.slice(0, 8000)}` },
      ],
      temperature: 0.3,
    },
    { headers: { Authorization: `Bearer ${env.openaiApiKey}` } },
  );
  return data.choices[0].message.content.trim();
}
