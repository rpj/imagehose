# imagehose

Uses text-to-image generative AI to create an ephemeral "photo feed" of the [Bluesky firehose](https://docs.bsky.app/docs/advanced-guides/firehose).

See it at [imagehose.net](https://imagehose.net)

## Running

Behavior is controlled via environment variables, see [Usage](#usage) below for details.

```
$ npm start
```

Or with docker:

```
$ docker build -t imagehose .
$ docker run ... imagehose
```

## Usage

### Environment varibles

Any not marked as required have reasonable defaults.

| Variable name | Description | Req'd? |
| ------------- | ----------- | ------ |
| `IMAGEHOSE_EXPECT_IMG_GEN_TIME_S` | The rough expected image generation time: it's not tracked and accounted for explicitly, instead this simple fudge is used. Will be subtracted from `IMAGEHOSE_ARTIFICAL_DELAY_S` | No |
| `IMAGEHOSE_PLOT_DATA_RETAIN_X_MORE_SAMPLES` | Retain this many times *more* samples for statistics than are retained for posts themselves (`IMAGEHOSE_POST_COUNT`) | No |
| `IMAGEHOSE_PLOT_X_PRCNT_MIN_AVERAGES` | Percentage of total samples retained (`IMAGEHOSE_PLOT_DATA_RETAIN_X_MORE_SAMPLES` * `IMAGEHOSE_POST_COUNT`) to use in the windowed average calculations. | No |
| `IMAGEHOSE_POST_COUNT` | Number of posts to retain before deleting the oldest. | No |
| `IMAGEHOSE_ARTIFICAL_DELAY_S` | Time, in seconds, to wait between each generation. Candidate posts are collected during this wait period. | No |
| `IMAGEHOSE_WAIT_FOR_ATLEAST` | Number of posts to wait for as candidates before first generation, after the process is started fresh. | No |
| `IMAGEHOSE_ADDL_FILTERS_JSON` | A JSON list of additional filter words to append to the profanity list generated from `@dsojevic/profanity-list` | No |
| `IMAGEHOSE_IMG_GEN_URL_PREFIX` | The full URL prefix, including the token & `prompt=`, of an [img-gen-cf](https://github.com/rpj/img-gen-cf) instance. | **YES** |
| `IMAGEHOSE_MODEL_URL` | The text-to-image model's URL | **YES** |
| `IMAGEHOSE_MODEL_NAME` | The text-to-image model's name | **YES** |
| `IMAGEHOSE_PAGE_AUTO_REFRESH_S` | How often the generated pages are set to auto-refresh | No |
| `IMAGEHOSE_WSS_SERVER_PORT` | Websocket server port | No |
| `IMAGEHOSE_FQDN` | Host fully-qualified domain name with protocol | **YES** |