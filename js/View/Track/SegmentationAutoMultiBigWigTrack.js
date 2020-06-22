define([
  "dojo/_base/declare",
  "MultiBigWig/View/Track/MultiWiggle/MultiXYPlot",
  "vcfview/Store/SeqFeature/SegmentationMultiBin",
  "vcfview/View/Dialog/SampleSelectVCF",
], function (declare, XYPlot, SegmentationMultiBin, SampleSelectVCF) {
  return declare(XYPlot, {
    constructor(args) {
      this.store = new SegmentationMultiBin(
        Object.assign(args, {
          store: this.store,
          config: this.config,
          browser: this.browser,
        })
      );
    },
    makeTrackLabel: function () {
      var thisB = this;
      var c = this.config;
      this.inherited(arguments);

      thisB.store.getParser().then(function (header) {
        thisB.samples = header.samples;
      });
    },

    _trackMenuOptions: function () {
      var track = this;
      var options = this.inherited(arguments);
      options.push({
        label: "Sample options",

        onClick: function () {
          console.log("clicked");
          new SampleSelectVCF({
            setCallback: function (sample, GenotypeField) {
              track.config.sample = sample;
              track.config.GenotypeField = GenotypeField;
              if (GenotypeField == "AD") {
                track.config.max_score = 1;
              } else {
                track.config.max_score = undefined;
              }

              track.browser.publish("/jbrowse/v1/c/tracks/replace", [
                track.config,
              ]);
            },
            samples: track.samples,
            SelectedSample: track.config.sample || 0,
            SelectedGenotype: track.config.GenotypeField || "DP",
          }).show();
        },
      });
      return options;
    },
  });
});
