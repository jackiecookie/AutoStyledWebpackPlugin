const webpack = require("webpack");
const DefinitionCollectParsePlugin = require("./DefinitionCollectParsePlugin");
const HarmonyImportSideEffectDependency = require("webpack/lib/dependencies/HarmonyImportSideEffectDependency");
const Parser = require("webpack/lib/Parser");
const path = require("path");



class InjectCssWebpackPlugin {


  constructor(options) {
    this.name = "InjectCssWebpackPlugin";
    this.options = options;
  }

  apply(compiler) {
    let self = this;
    let options = this.options;

    function getStyleRequest(name, context = null) {
      let rawRequest = options.library;
      let style = options.style;
      let styleRequest = "";
      switch (typeof style) {
        case "string":
          styleRequest = path.resolve(
            context,
            rawRequest,
            style,
            name.toLowerCase() + ".css"
          );
          break;
        case "function":
          styleRequest = style(rawRequest, name);
          break;
      }

      return styleRequest;
    }

    function getVarValue(parser, name, expression, compilation) {
      // new Parser from current parse
      let itemModuleParser = new Parser(parser.options, parser.sourceType);
      let definitionCollector = new DefinitionCollectParsePlugin([name]).apply(
        itemModuleParser
      );
      itemModuleParser.hooks.importCall.tap(self.name, function(expr) {
        if (expression.start === expr.start && expression.end === expr.end) {
          //stop collect
          definitionCollector.stop();
        }
      });
      let module = parser.state.current;
      itemModuleParser.parse(module._source.source(), {
        current: module,
        module,
        compilation: compilation,
        options: compilation.options
      });
      var val =  definitionCollector.get(name);
      definitionCollector.dispose();
      return val;
    }

    compiler.hooks.compilation.tap(
      self.name,
      (compilation, { normalModuleFactory }) => {
        compilation.hooks.succeedModule.tap(self.name, (module) => {
          if (module.dependencies && module.dependencies.length) {
            let importOrder = 0;
            for (const dependencie of module.dependencies.reverse()) {
              if (dependencie.sourceOrder) {
                importOrder = dependencie.sourceOrder;
                break;
              }
            }
            module.dependencies.forEach(dependencie => {
              if (
                dependencie.request === options.library &&
                dependencie.type === "harmony import specifier"
              ) {
                let request = getStyleRequest(
                  dependencie.name,
                  dependencie.originModule.context
                );
                const cssDependency = new HarmonyImportSideEffectDependency(
                  request,
                  module,
                  ++importOrder,
                  dependencie.parserScope
                );
                cssDependency.loc = dependencie.loc;
                cssDependency.loc.end.line++;
                cssDependency.loc.start.line++;
                module.addDependency(cssDependency);
              }
            });
          }
        });

        normalModuleFactory.hooks.parser
          .for("javascript/auto")
          .tap(self.name, (parser) => {
            //async component
            parser.hooks.importCall.tap(self.name, function(expression) {
              let arg = expression.arguments[0];
              let path = "";
              if (arg.type === "Literal") {
                path = arg.value;
              } else if (arg.type === "Identifier") {
                path = getVarValue(parser, arg.name, expression, compilation);
              }
              if (path && path.startsWith(options.library)) {
                let name = /[^/]+$/g.exec(path)[0];
                let request = getStyleRequest(
                  name,
                  parser.state.module.context
                );
                parser.state.lastHarmonyImportOrder =
                  (parser.state.lastHarmonyImportOrder || 0) + 1;
                const sideEffectDep = new HarmonyImportSideEffectDependency(
                  request,
                  parser.state.module,
                  parser.state.lastHarmonyImportOrder,
                  parser.state.harmonyParserScope
                );
                sideEffectDep.loc = expression.loc;
                parser.state.module.addDependency(sideEffectDep);
                return true;
              }
            });

            // parser.hooks.call.for("require").tap(self.name, expr => {});
          });

        // compilation.hooks.finishModules.tapPromise(self.name, (modules) => {
        //   // let modules = compilation.modules;
        //   modules.forEach(module => {
        //     //find module need rebuild
        //     if (this.collectVariablesMap.has(module)) {
        //       self.definitionCollector = new DefinitionCollectParsePlugin(
        //         this.collectVariablesMap.get(module)
        //       );
        //       self.definitionCollector.apply(module.parser);
        //       // rebuild module to collect definition value
        //       // but rebuild seems not good idea
        //       // https://stackoverflow.com/questions/35092183/webpack-plugin-how-can-i-modify-and-re-parse-a-module-after-compilation
        //       // module.parser.parse(module._source.source(), {
        //       //   current: module,
        //       //   module,
        //       //   compilation: compilation,
        //       //   options: compilation.options
        //       // });
        //       // compilation.rebuildModule(
        //       //   module,
        //       //   (function callBackDispose(definitionCollector) {
        //       //     return function() {
        //       //       definitionCollector.dispose();
        //       //     };
        //       //   })(self.definitionCollector)
        //       // );
        //     }
        //   });
        // });
      }
    );
  }
}
module.exports = InjectCssWebpackPlugin;