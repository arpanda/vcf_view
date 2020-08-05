const { TabixIndexedFile } = cjsRequire('@gmod/tabix');
const VCF = cjsRequire('@gmod/vcf');
import AbortablePromiseCache from 'abortable-promise-cache';
import LRU from 'quick-lru';

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
  'dojo/_base/declare',
  'JBrowse/Store/SeqFeature/VCFTabix',
  'JBrowse/Model/SimpleFeature',
], function (declare, VCFTabix, SimpleFeature) {
  return declare(VCFTabix, {
    constructor() {
      this.featureCache = new AbortablePromiseCache({
        cache: new LRU({
          maxSize: 20,
        }),
        fill: this._readChunk.bind(this),
      });
    },
    async _readChunk(query) {
      const parser = await this.getParser();
      const samples = parser.samples;

      const regularizedReferenceName = this.browser.regularizeReferenceName(
        query.ref,
      );

      var features = [];
      await this.indexedData.getLines(
        regularizedReferenceName,
        0,
        undefined,
        (line, fileOffset) => {
          const fields = line.split('\t');
          const start = +fields[1];
          const format = fields[8].split(':');
          const AD = format.indexOf('AD');
          if (AD) {
            const [ALT, REF] = fields[9].split(':')[AD].split(',');
            features.push({
              score: +ALT / (+ALT + +REF),
              start,
              end: start + 1,
              uniqueId: fileOffset,
            });
          }
        },
      );
      console.log({ features });

      return features;
    },

    async _getFeatures(
      query,
      featureCallback,
      finishedCallback,
      errorCallback,
    ) {
      try {
        const features = await this.featureCache.get(query.ref, query);
        features.forEach(feature => {
          if (feature.end > query.start && feature.start < query.end) {
            featureCallback(
              new SimpleFeature({
                data: Object.assign(Object.create(feature)),
              }),
            );
          }
        });

        finishedCallback();
      } catch (e) {
        errorCallback(e);
      }
    },
  });
});
