import { Firehose } from '@atproto/sync';
import { IdResolver } from '@atproto/identity';
import fs from 'fs/promises';
import WebSocket, { WebSocketServer } from 'ws';
import { v4 } from 'uuid';
import logger from './logger';
logger('imagehose');
import { fmtDuration } from './duration';
import htmlFromTemplates from './templates';
import Conditions from './candidate-conds';

const WSS_SERVER_PORT = Number.parseInt(process.env.IMAGEHOSE_WSS_SERVER_PORT ?? '4033');
const EXPECT_IMG_GEN_TIME_S = Number.parseInt(process.env.IMAGEHOSE_EXPECT_IMG_GEN_TIME_S ?? '10');
const PLOT_DATA_RETAIN_X_MORE_SAMPLES = Number.parseInt(process.env.IMAGEHOSE_PLOT_DATA_RETAIN_X_MORE_SAMPLES ?? '6');
const PLOT_X_PRCNT_MIN_AVERAGES = Number.parseFloat(process.env.IMAGEHOSE_PLOT_X_PRCNT_MIN_AVERAGES ?? '10') / 100;
const POST_COUNT = Number.parseInt(process.env.IMAGEHOSE_POST_COUNT ?? '60');
const ADS_ORIG = Number.parseInt(process.env.IMAGEHOSE_ARTIFICAL_DELAY_S ?? '30');
const ARTIFICAL_DELAY_S = ADS_ORIG - EXPECT_IMG_GEN_TIME_S;
const WAIT_FOR_ATLEAST = Number.parseInt(process.env.IMAGEHOSE_WAIT_FOR_ATLEAST ?? '50');
const PLOT_AVERAGES_X_MIN = ((POST_COUNT * (ADS_ORIG / 60)) * PLOT_DATA_RETAIN_X_MORE_SAMPLES) * PLOT_X_PRCNT_MIN_AVERAGES;
const FILTER_REASONS = Object.keys(Conditions).reduce((a, k) => ({ ...a, [k]: 0 }), {});
const STATS = {
  TOTAL_EVENTS: 0, START: Date.now(),
  EPM_SAMPLES: { DATA: [], ADATA: [], TS: [], CANDIDATES: [], ACAND: [], IGT: [], AIGT: [] }
};

function windowedAvg(dataList) {
  const findTs = [...STATS.EPM_SAMPLES.TS].reverse();
  let sliceIdx = findTs.findIndex((ts) => ((Date.now() - ts) / 1000 / 60) > PLOT_AVERAGES_X_MIN);
  if (sliceIdx === -1) {
    sliceIdx = STATS.EPM_SAMPLES.TS.length;
  }
  sliceIdx = STATS.EPM_SAMPLES.TS.length - sliceIdx;
  return dataList
    .slice(sliceIdx, dataList.length)
    .reduce((a, x) => a + x, 0) / (dataList.length - sliceIdx);
}

async function genImage(fname: string, text: string) {
  const PREFIX = process.env.IMAGEHOSE_IMG_GEN_URL_PREFIX;
  const abort = AbortSignal.timeout((EXPECT_IMG_GEN_TIME_S * 10) * 1000);
  console.debug(`Prompting with: "${text}"`);
  const fetchStart = Date.now();
  const response = await fetch(`${new URL(`${PREFIX}${text}`)}`, { signal: abort });
  const genTime = Date.now() - fetchStart;

  const blob = await response.blob();
  if (blob.type !== "image/png") {
    throw new Error(`Unknown image type! ${blob.type}`);
  }

  STATS.EPM_SAMPLES.IGT.push(genTime);
  STATS.EPM_SAMPLES.AIGT.push(windowedAvg(STATS.EPM_SAMPLES.IGT));
  console.log(`Generated ${fname} in ${genTime}ms`);

  await fs.writeFile(`_public/${fname}.png`, Buffer.from(await blob.arrayBuffer()));
  return `${fname}.png`;
}

function wssPostFromCandidate(candidate) {
  const { promptedText, imagehoseGeneratedAt, imagePath, aka, postUrl, text, createdAt, did } = candidate;
  return {
    alsoKnownAs: aka,
    did,
    postUrl,
    imageUrl: `${process.env.IMAGEHOSE_FQDN}/${imagePath}`,
    text,
    promptedText,
    createdAt,
    imagehoseGeneratedAt,
  };
}

async function letsGo(candidatePosts, currentPosts) {
  const wssClients: Map<string, WebSocket> = new Map();
  const wss = new WebSocketServer({
    port: WSS_SERVER_PORT,
  });

  function removeClient(clientKey: string, closedWs: WebSocket) {
    if (!wssClients.has(clientKey)) {
      console.error(`Close on unknown client!`, closedWs);
      return;
    }

    console.log('WSS close', clientKey);
    wssClients.delete(clientKey);
  }

  wss.on('connection', function connection(ws: WebSocket) {
    const clientKey = v4();
    console.log('WSS connect', clientKey);
    ws.on('error', function (erroredWs) {
      console.warn('WSS client errored', erroredWs);
      removeClient(clientKey, erroredWs);
    });

    ws.on('close', removeClient.bind(null, clientKey));

    wssClients.set(clientKey, ws);
  });

  while (going) {
    const bestCandidate = candidatePosts.sort((a, b) => b.sortScore - a.sortScore)[0];
    STATS.EPM_SAMPLES.CANDIDATES.push(candidatePosts.length);
    STATS.EPM_SAMPLES.ACAND.push(windowedAvg(STATS.EPM_SAMPLES.CANDIDATES));
    candidatePosts.splice(0);
    try {
      const promptedText = bestCandidate.text.replace('#', '');
      const imagePath = await genImage(bestCandidate.fname, promptedText);
      const imagehoseGeneratedAt = new Date().toISOString();
      if (currentPosts.length === POST_COUNT) {
        const dropping = currentPosts.shift();
        await fs.unlink(`_public/${dropping.imagePath}`);
        console.log(`Dropped ${dropping.imagePath}`);
        if (STATS.EPM_SAMPLES.TS.length === POST_COUNT * PLOT_DATA_RETAIN_X_MORE_SAMPLES) {
          const droppedStats = Object.entries(STATS.EPM_SAMPLES).reduce((a, [k, v]) => ({
            ...a,
            [k]: v.shift()
          }), {});
          console.log(`Dropped stats sample: ${JSON.stringify(droppedStats, null, 2)}`);
        }
      }

      const newPost = { promptedText, imagehoseGeneratedAt, imagePath, ...bestCandidate };
      currentPosts.push(newPost);
      const postJson = JSON.stringify(wssPostFromCandidate(newPost));
      wssClients.forEach((wsClient: WebSocket) => wsClient.send(postJson))
      const posts = [...currentPosts];
      posts.reverse();
      const uptimeMs = Date.now() - STATS.START;
      const eventsPerSecond = STATS.TOTAL_EVENTS / (uptimeMs / 1000);
      STATS.EPM_SAMPLES.DATA.push(eventsPerSecond);
      STATS.EPM_SAMPLES.TS.push(Date.now());
      STATS.EPM_SAMPLES.ADATA.push(windowedAvg(STATS.EPM_SAMPLES.DATA));
      const renderContext = {
        posts,
        currentDelayS: ARTIFICAL_DELAY_S + EXPECT_IMG_GEN_TIME_S,
        pageRefreshS: process.env.IMAGEHOSE_PAGE_AUTO_REFRESH_S ?? ((ARTIFICAL_DELAY_S + EXPECT_IMG_GEN_TIME_S) * 2),
        windowCount: POST_COUNT,
        filterReasons: Object.entries(FILTER_REASONS).map(([name, value]) => ({
          name,
          value,
          percentage: Number((value as number / STATS.TOTAL_EVENTS) * 100).toFixed(1)
        })),
        STATS,
        uptimeMs,
        eventsPerSecond: Number(eventsPerSecond).toFixed(0),
        HEADER: null,
        PLOT_AVERAGES_X_MIN: Math.round(PLOT_AVERAGES_X_MIN),
        updateTs: new Date().toUTCString(),
        statsDataFromLastHrs: fmtDuration(STATS.EPM_SAMPLES.TS[0]),
        modelUrl: process.env.IMAGEHOSE_MODEL_URL,
        modelName: process.env.IMAGEHOSE_MODEL_NAME,
      };

      await htmlFromTemplates(renderContext);
    } catch (error) {
      // we didn't use this candidate, so remove its stats entry
      STATS.EPM_SAMPLES.CANDIDATES.pop();
      STATS.EPM_SAMPLES.ACAND.pop();
      console.debug(error);
      console.error(`go threw: "${error}"`);
    }

    await new Promise((resolve) => setTimeout(resolve, ARTIFICAL_DELAY_S * 1000));
  }
}

let going;
async function go(candidatePosts, currentPosts) {
  if (going) {
    return;
  }

  if (candidatePosts.length < WAIT_FOR_ATLEAST) {
    const more = WAIT_FOR_ATLEAST - candidatePosts.length;
    if (more === WAIT_FOR_ATLEAST || !(more % 5)) {
      console.log(`Waiting for ${WAIT_FOR_ATLEAST - candidatePosts.length} more...`);
    }
    return;
  }

  going = true;
  letsGo(candidatePosts, currentPosts);
}

async function handleEvent(candidatePosts, currentPosts, idResolver: IdResolver, evt) {
  STATS.TOTAL_EVENTS++;
  const outObj: { score?: number, positive?: Array<string> } = {};
  // don't use Promise.all because we want these *serialized*
  for (const [name, cond] of Object.entries(Conditions)) {
    if (!(await cond(evt, outObj, currentPosts))) {
      if (name === 'noDuplicates') {
        console.warn(`Filtered dupe!`, evt);
      }

      FILTER_REASONS[name]++;
      return;
    }
  }

  const { score, positive } = outObj;
  const { alsoKnownAs } = await idResolver.did.resolve(evt.did);
  const aka = alsoKnownAs[0].replace("at://", "");
  const postUrl = `https://bsky.app/profile/${aka}/post/${evt.rkey}`;
  candidatePosts.push({
    aka,
    did: evt.did,
    postUrl,
    fname: `${evt.did}_${evt.rkey}`,
    score,
    positive,
    sortScore: score + (positive.length / 4),
    text: evt.record.text,
    createdAt: evt.record.createdAt,
    createdAtUtcString: new Date(evt.record.createdAt).toUTCString().replace(/^.*?(\d+:\d+:\d+ GMT)/, "$1"),
  });

  if (!going) {
    // use incoming message cadence as our "clock" before starting the main loop
    go(candidatePosts, currentPosts);
  }
}

async function main() {
  const candidatePosts = [];
  const currentPosts = [];
  const idResolver = new IdResolver();
  const firehose = new Firehose({
    idResolver,
    service: 'wss://bsky.network',
    unauthenticatedCommits: true,
    unauthenticatedHandles: true,
    excludeIdentity: true,
    excludeAccount: true,
    onError: console.error,
    handleEvent: handleEvent.bind(null, candidatePosts, currentPosts, idResolver),
  });

  process.on('SIGINT', () => {
    firehose.destroy();
    process.exit();
  });

  firehose.start();
}

main();
