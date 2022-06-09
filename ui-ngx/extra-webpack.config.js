/*
 * Copyright © 2016-2022 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const CompressionPlugin = require("compression-webpack-plugin");
const JavaScriptOptimizerPlugin = require("@angular-devkit/build-angular/src/webpack/plugins/javascript-optimizer-plugin").JavaScriptOptimizerPlugin;
const webpack = require("webpack");
const dirTree = require("directory-tree");
const ngWebpack = require('@ngtools/webpack');

var langs = [];

dirTree("./src/assets/locale/", {extensions: /\.json$/}, (item) => {
  /* It is expected what the name of a locale file has the following format: */
  /* 'locale.constant-LANG_CODE[_REGION_CODE].json', e.g. locale.constant-es.json or locale.constant-zh_CN.json*/
  langs.push(item.name.slice(item.name.lastIndexOf("-") + 1, -5));
});

module.exports = (config, options) => {
  config.plugins.push(
    new webpack.DefinePlugin({
      TB_VERSION: JSON.stringify(require("./package.json").version),
      SUPPORTED_LANGS: JSON.stringify(langs),
    })
  );
  config.plugins.push(
    new webpack.ProvidePlugin(
      {
        $: "jquery"
      }
    )
  );
  config.plugins.push(
    new CompressionPlugin({
      filename: "[path][base].gz[query]",
      algorithm: "gzip",
      test: /\.js$|\.css$|\.html$|\.svg?.+$|\.jpg$|\.ttf?.+$|\.woff?.+$|\.eot?.+$|\.json$/,
      threshold: 10240,
      minRatio: 0.8,
      deleteOriginalAssets: false,
    })
  );
  config.plugins.push(
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    })
  );

  if (config.mode === 'production') {
    const index = config.plugins.findIndex(p => p instanceof ngWebpack.ivy.AngularWebpackPlugin);
    const angularCompilerOptions = config.plugins[index].pluginOptions;
    angularCompilerOptions.emitClassMetadata = true;
    angularCompilerOptions.emitNgModuleScope = true;
    config.plugins.splice(index, 1);
    config.plugins.push(new ngWebpack.ivy.AngularWebpackPlugin(angularCompilerOptions));
    const javascriptOptimizerOptions = config.optimization.minimizer[1].options;
    delete javascriptOptimizerOptions.define.ngJitMode;
    config.optimization.minimizer.splice(1, 1);
    config.optimization.minimizer.push(new JavaScriptOptimizerPlugin(javascriptOptimizerOptions));
  }
  return config;
};
