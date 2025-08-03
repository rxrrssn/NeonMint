import fs from 'fs';
import path from 'path';
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
// Load environment variables
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

const databaseId = process.env.NOTION_DATABASE_ID!;
const outputDir = path.join(process.cwd(), '/src/pages/courses/posts');


function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // Remove unwanted chars
    .replace(/\s+/g, '-')       // Replace spaces with dashes
    .replace(/--+/g, '-')       // Collapse multiple dashes
    .replace(/^-+|-+$/g, '');   // Trim dashes at start/end
}

async function downloadFile(fileProp: any[] | undefined, label: string, crn: string): Promise<string | null> {
  const file = fileProp?.[0];
  if (!file) return null;

  const url = file.file?.url || file.external?.url;
  if (!url) return null;

  const ext = path.extname(url).split('?')[0] || '.pdf';
  const filename = `${crn}-${label}${ext}`;
  const saveDir = path.resolve(process.cwd(), 'public/documents/posts');
  const savePath = path.join(saveDir, filename);

  if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(savePath, Buffer.from(buffer));
    console.log(`📥 Downloaded ${label} for ${crn}: ${savePath}`);
    return `/documents/posts/${filename}`;
  } catch (err) {
    console.error(`❌ Failed to download ${label} for ${crn}:`, err);
    return null;
  }
}

async function main() {
  if (!databaseId) {
    console.error('❌ NOTION_DATABASE_ID not set in env');
    process.exit(1);
  }

  try {
    const response = await notion.databases.query({ database_id: databaseId });
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    for (const page of response.results) {
      const props = page.properties;

      const easyName = props['Easy Name']?.title?.[0]?.plain_text || 'untitled';
      const fullName = props['Full Name']?.rich_text?.[0]?.plain_text || 'NoFullName';
      const crn = props['CRN']?.rich_text?.[0]?.plain_text || 'NoCRN';
      const author = props['Instructor']?.people?.[0]?.name || 'Unknown';
      const pubDate = props['Start Date']?.date?.start || new Date().toISOString();
      const tags = props['term']?.relation?.map((rel: any) => rel.id) || [];
      const languages = props['School']?.relation?.map((rel: any) => rel.id) || [];

      let cGPA: number | null = null;
      let pGPA: number | null = null;
      let progress: number | null = null;

      const cGradeProp = props.cGrade?.formula;
      if (cGradeProp) cGPA = cGradeProp.number ?? (cGradeProp.string !== null ? parseFloat(cGradeProp.string) : null);

      const pGradeProp = props.pGrade?.formula;
      if (pGradeProp) pGPA = pGradeProp.number ?? (pGradeProp.string !== null ? parseFloat(pGradeProp.string) : null);

      const progressProp = props.Progress?.formula;
      if (progressProp) progress = progressProp.number ?? (progressProp.string !== null ? parseFloat(progressProp.string) : null);

      // Download header image (from page cover)
      let imageFilename: string | null = null;
      if (page.cover) {
        const cover = page.cover;
        let imageUrl: string | null = null;
        if (cover.type === 'external') imageUrl = cover.external.url;
        else if (cover.type === 'file') imageUrl = cover.file.url;

        if (imageUrl) {
          const imageExt = path.extname(imageUrl).split('?')[0] || '.png';
          imageFilename = `${crn}${imageExt}`;
          const imagePath = path.resolve(process.cwd(), `public/images/posts/${imageFilename}`);

          if (!fs.existsSync(path.dirname(imagePath))) fs.mkdirSync(path.dirname(imagePath), { recursive: true });

          try {
            const res = await fetch(imageUrl);
            if (!res.ok) throw new Error(`Failed to fetch cover image: ${res.statusText}`);
            const buffer = await res.arrayBuffer();
            fs.writeFileSync(imagePath, Buffer.from(buffer));
            console.log(`📥 Downloaded header image for ${crn}: ${imagePath}`);
          } catch (e) {
            console.error(`❌ Error downloading header image for ${crn}:`, e);
            imageFilename = null;
          }
        }
      }

      // Download attachments
      const syllabusPath = await downloadFile(props['Course Syllabus']?.files, 'Syllabus', crn);
      const signaturePath = await downloadFile(props['Signature Assignment']?.files, 'Signature', crn);

      // Markdown content
      const mdBlocks = await n2m.pageToMarkdown(page.id);
      let mdString = n2m.toMarkdownString(mdBlocks);

      if (typeof mdString === 'object' && mdString !== null && 'parent' in mdString) {
        mdString = [mdString.parent, ...(mdString.children || [])].join('\n\n');
      }

      const slug = slugify(crn);

      const frontmatter = `---
layout: /src/layouts/NotionImport.astro
pubDate: "${pubDate}"
author: "${author}"
cGrade: ${cGPA ?? 'null'}
pGrade: ${pGPA ?? 'null'}
progress: ${progress ?? 'null'}
tags: [${tags.map(t => `"${t}"`).join(', ')}]
languages: [${languages.map(l => `"${l}"`).join(', ')}]
${imageFilename ? `image:
  url: "/images/posts/${imageFilename}"` : ''}
${syllabusPath ? `syllabus: "${syllabusPath}"` : ''}
${signaturePath ? `signature: "${signaturePath}"` : ''}
title: "${fullName} (${crn})"
---

# ${fullName} (${crn})

${mdString}
`;

      const filePath = path.join(outputDir, `${slug}.md`);
      fs.writeFileSync(filePath, frontmatter);
      console.log(`✅ Saved: ${filePath}`);
    }
  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

main();