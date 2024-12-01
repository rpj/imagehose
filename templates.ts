import fs from 'fs/promises';
import mustache from 'mustache';

async function readTemplates(templateList = ['./imagehose.header.html', './imagehose.index.html', './imagehose.stats.html']) {
  return templateList.reduce(async (a, fname) => ({
    ...(await a),
    [fname]: (await fs.readFile(fname)).toString('utf-8'),
  }), {});
}

let CONTAINER_CACHE: { [key: string]: string };
export default async function (renderContext: { [key: string]: any }) {
  let templates;
  if (process.env.IN_CONTAINER) {
    if (!CONTAINER_CACHE) {
      CONTAINER_CACHE = await readTemplates();
    }

    templates = CONTAINER_CACHE;
  }
  else {
    // re-read the templates each time to allow editing in between renders. could be triggered on a signal.
    templates = await readTemplates();
  }

  renderContext.HEADER = mustache.render(templates['./imagehose.header.html'], renderContext);
  await fs.writeFile("_public/index.html", mustache.render(templates['./imagehose.index.html'], renderContext));
  await fs.writeFile("_public/stats.html", mustache.render(templates['./imagehose.stats.html'], renderContext));
}
