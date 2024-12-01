import Sentiment from 'sentiment';
import { SentimentAnalyzer } from 'node-nlp';
import profanityFilters from './prof-filters';

const analyzer = new Sentiment();
const nlpAnalyzer = new SentimentAnalyzer();
const filters = profanityFilters();

export default {
  async mustBeCreateEvent(evt) {
    return evt.event === 'create';
  },

  async eventTypeMustBePost(evt) {
    return evt.record?.['$type'] === 'app.bsky.feed.post';
  },

  async enLangFound(evt) {
    return Array.isArray(evt.record?.langs) && evt.record?.langs.includes('en');
  },

  async postHasText(evt) {
    return evt.record?.text && (evt.record.text as string).length && !evt.record.text.match(/^\s*$/);
  },

  async noDuplicates(evt, _, currentPosts) {
    return currentPosts.every(({ text }) => text !== evt.record.text);
  },

  async noProfanity(evt) {
    return filters.every((f) => !(evt.record?.text as string)?.match(f))
  },

  async nlpAnalysis(evt) {
    const { numWords, vote } = await nlpAnalyzer.getSentiment(evt.record?.text);
    return numWords > 30 && vote === 'positive';
  },

  async sentiment(evt, outObj) {
    const { score, positive, negative } = analyzer.analyze(evt.record?.text);
    outObj.score = score;
    outObj.positive = positive;
    return score > 0 && positive.length && !negative.length;
  }
};
