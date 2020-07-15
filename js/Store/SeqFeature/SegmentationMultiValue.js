define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "JBrowse/Store/LRUCache",
  "JBrowse/Store/SeqFeature",
  "JBrowse/Model/SimpleFeature",
  "JBrowse/Store/SeqFeature/VCFTabix",
], function (
  declare,
  lang,
  LRUCache,
  SeqFeatureStore,
  SimpleFeature,
  VCFTabix
) {
  return declare([VCFTabix, SeqFeatureStore], {
    constructor(args) {
      this.dpField = args.dpField || "DP";
      this.binSize = args.binSize || 100000;
      // this.featureCache = new LRUCache({
      //   name: "vcfFeatureCache",
      //   fillCallback: dojo.hitch(this, "_readChunk"),
      //   sizeFunction: function (features) {
      //     return features.length;
      //   },
      //   maxSize: 100000,
      // });
      console.log("check start");
    },

    _getRegionStats(query, successCallback, errorCallback) {
      var thisB = this;
      var cache = (thisB._regionStatsCache =
        thisB._regionStatsCache ||
        new LRUCache({
          name: "regionStatsCache",
          maxSize: 1000, // cache stats for up to 1000 different regions
          sizeFunction: function (stats) {
            return 1;
          },
          fillCallback: function (query, callback) {
            //console.log( '_getRegionStats', query );
            var s = {
              scoreMax: -Infinity,
              scoreMin: Infinity,
              scoreSum: 0,
              scoreSumSquares: 0,
              basesCovered: query.end - query.start,
              featureCount: 0,
            };
            let bins = [];
            thisB.getFeatures(
              query,
              function (feature) {
                var score = feature.get("score") || 0;
                s.scoreMax = Math.max(score, s.scoreMax);
                s.scoreMin = Math.min(score, s.scoreMin);
                s.scoreSum += score;
                s.scoreSumSquares += score * score;
                s.featureCount++;
                bins.push(feature);
              },
              function () {
                let bin_count = 0,
                  bin_score = 0;
                bins.forEach((bin) => {
                  if (bin.get("source") === "main") {
                    bin_count += bin.get("count");
                    bin_score += bin.get("rawscore");
                  }
                });
                console.log("Average DP", bin_score / bin_count);
                s.scoreMean = s.featureCount ? s.scoreSum / s.featureCount : 0;
                s.scoreStdDev = thisB._calcStdFromSums(
                  s.scoreSum,
                  s.scoreSumSquares,
                  s.featureCount
                );
                s.featureDensity = s.featureCount / s.basesCovered;
                //console.log( '_getRegionStats done', s );
                callback(s);
              },
              function (error) {
                callback(null, error);
              }
            );
          },
        }));

      cache.get(query, function (stats, error) {
        if (error) errorCallback(error);
        else successCallback(stats);
      });
    },
    async getFeatures(query, featCallback, finishCallback, errorCallback) {
      var binSize = this.binSize;
      var supermethod = this.getInherited(arguments);
      const { ref, start: originalStart, end: originalEnd } = query;
      console.log("start: ", originalStart, "end: ", originalEnd);
      //if (originalEnd === 12561812) debugger;

      var start = originalStart - (originalStart % binSize);
      var end = originalEnd + (binSize - (originalEnd % binSize));

      var bins = [];
      for (let i = start; i < end; i += binSize) {
        bins.push({ score: 0, count: 0 });
      }

      supermethod.call(
        this,
        { ref, start, end },
        (feature) => {
          let genotype = feature.get("genotypes");
          let samples = Object.keys(genotype);

          let sample_position = samples.length - 1;
          let sample_name = feature.get("genotypes")[samples[sample_position]];

          //score += sample_name[this.dpField].values[0];

          let sample_score = 0;
          const field_list = ["DP", "mutect_DP", "strelka_DP", "lofreq_DP"];
          field_list.forEach((val) => {
            if (typeof sample_name[val] != "undefined") {
              sample_score = sample_name[val].values[0];
            }
          });
          const featureBin = Math.max(
            Math.floor((feature.get("start") - start) / binSize),
            0
          );
          bins[featureBin].score += sample_score;
          bins[featureBin].count++;
        },
        () => {
          // var bin_count = 0,
          //   bin_score = 0;

          // bins.forEach((bin) => {
          //   bin_count += bin.count;
          //   bin_score += bin.score;
          // });
          // console.log("Avg DP", bin_score / bin_count);

          bins.forEach((bin, i) => {
            if (bin.count) {
              featCallback(
                new SimpleFeature({
                  id: `${start + binSize * i}_feat_1`,
                  data: {
                    start: start + binSize * i,
                    end: start + binSize * (i + 1),
                    score: bin.score / bin.count,
                    rawscore: bin.score,
                    count: bin.count,
                    source: "main",
                  },
                })
              );
              featCallback(
                new SimpleFeature({
                  id: `${start + binSize * i}_feat_2`,
                  data: {
                    start: start + binSize * i,
                    end: start + binSize * (i + 1),
                    score: bin.score / bin.count + 5,
                    count: bin.count,
                    rawscore: bin.score + 5,
                    source: "secondary",
                  },
                })
              );
            }
          });
          finishCallback();
        },
        errorCallback
      );
    },
  });
});
