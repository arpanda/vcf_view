import AbortablePromiseCache from "abortable-promise-cache";
import LRU from "quick-lru";

function getMean(data) {
  return (
    data.reduce(function (a, b) {
      return a + b;
    }) / data.length
  );
}
function getSD(data) {
  let m = getMean(data);
  return Math.sqrt(
    data.reduce(function (sq, n) {
      return sq + (n - m) * (n - m);
    }, 0) /
      (data.length - 1),
  );
}

define([
  "dojo/_base/declare",
  "JBrowse/Store/SeqFeature/VCFTabix",
  "JBrowse/Model/SimpleFeature",
], function (declare, VCFTabix, SimpleFeature) {
  return declare(VCFTabix, {
    constructor(args) {
      this.sample = args.sample || 0;
      this.featureCache = new AbortablePromiseCache({
        cache: new LRU({
          maxSize: 20,
        }),
        fill: this._readChunk.bind(this),
      });
    },

    async parseGC() {
      const result = await fetch(this.resolveUrl(this.config.gcContent));
      if (!result.ok) {
        throw new Error("no gc content specified");
      }
      const text = await result.text();
      const refs = {};
      text.split("\n").forEach(row => {
        if (row.trim() !== "") {
          const [refName, start, gcContent, gcCount, atCount] = row.split("\t");
          if (!refs[refName]) {
            refs[refName] = [];
          }
          refs[refName].push({
            start: +start,
            gcContent: +gcContent,
            gcCount: +gcCount,
            atCount: +atCount,
          });
        }
      });
      console.log({ refs });
      return refs;
    },
    async _readChunk(query) {
      const parser = await this.getParser();
      const samples = parser.samples;
      const gc = await this.parseGC();
      const gcContent = {};

      const regularizedReferenceName = this.browser.regularizeReferenceName(
        query.ref,
      );

      let binSize = 100000;
      var bins = [];

      const refName = query.ref.replace("chr", "");
      const chrGc = gc[refName];

      await this.indexedData.getLines(
        regularizedReferenceName,
        0,
        undefined,
        (line, fileOffset) => {
          const fields = line.split("\t");
          const start = +fields[1];
          const format = fields[8].split(":");
          const DP = format.indexOf("DP");
          const featureBin = Math.max(Math.floor(start / binSize), 0);
          const gcVal = chrGc[featureBin].gcContent;
          const gcBin = 3 * Math.ceil(gcVal / 3);
          if (!gcContent[gcBin]) {
            gcContent[gcBin] = [];
          }
          if (!bins[featureBin]) {
            bins[featureBin] = { score: 0, count: 0 };
          }
          bins[featureBin].start = featureBin * binSize;
          bins[featureBin].end = (featureBin + 1) * binSize;
          bins[featureBin].id = fileOffset;
          const sampleName = samples[this.sample];
          const score = +fields[9 + this.sample].split(":")[DP];
          const finalScore = isNaN(score) ? 0 : score;
          bins[featureBin].score += finalScore;
          bins[featureBin].count++;
          bins[featureBin].source = sampleName;
          gcContent[gcBin].push(finalScore);
        },
      );
      let globalAverage = 0;
      bins.forEach(sample => {
        globalAverage += sample.score / (sample.count || 1);
      });
      globalAverage /= bins.length;

      bins.forEach(sample => {
        sample.score = sample.score / (sample.count || 1);
        const start = sample.start;
        const featureBin = Math.max(Math.floor(start / binSize), 0);
        const gcVal = chrGc[featureBin].gcContent;
        const gcBin = 3 * Math.ceil(gcVal / 3);
        const bin = gcContent[gcBin];
        const meanScoreForGcBin = getMean(bin);
        sample.score *= globalAverage / meanScoreForGcBin;
      });

      return {
        average: globalAverage,
        bins,
      };
    },

    async _getFeatures(
      query,
      featureCallback,
      finishedCallback,
      errorCallback,
    ) {
      try {
        const { bins, average } = await this.featureCache.get(query.ref, query);

        bins.forEach(feature => {
          if (feature.end > query.start && feature.start < query.end) {
            const sample = feature;
            featureCallback(
              new SimpleFeature({
                data: Object.assign(Object.create(feature), {
                  score: sample.score,
                  source: sample.source,
                }),
              }),
            );
          }
        });

        featureCallback(
          new SimpleFeature({
            data: {
              start: 0,
              end: this.browser.view.ref.end,
              score: average,
              uniqueId: "average_" + this.sample,
              source: "average",
            },
          }),
        );

        finishedCallback();
      } catch (e) {
        errorCallback(e);
      }
    },
  });
});