define([
  "dojo/_base/declare",
  "MultiBigWig/View/Track/MultiWiggle/MultiXYPlot",
  "vcfview/View/Dialog/SampleSelectVCF",
], function (declare, XYPlot, SampleSelectVCF) {
  return declare(XYPlot, {
    makeTrackLabel() {
      this.inherited(arguments);

      this.store.getParser().then((header) => {
        this.samples = header.samples;
        console.log(this.browser.view);
        let binCount = 0;
        let binScore = 0;
        let secondaryBinCount = 0;
        let secondaryBinScore = 0;
        const { end, start, name: ref } = this.browser.view.ref;
        console.time("start");
        this.store.getFeatures(
          { ref, start, end },
          (bin) => {
            if (bin.get("source") === "main") {
              binCount += bin.get("count");
              binScore += bin.get("rawscore");
            }
            if (bin.get("source") === "secondary") {
              binCount += bin.get("count");
              binScore += bin.get("rawscore");
            }
          },
          () => {
            console.timeEnd("start");
            console.log(binScore / binCount);
          }
        );
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
