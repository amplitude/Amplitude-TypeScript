import path from "path";
import { Configuration } from "webpack";
import * as webpackDevServer from 'webpack-dev-server';

const config: Configuration = {
  entry: "./src/index.ts",
  module: {
    rules: [
      {
        test: /\.(ts|js)?$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-typescript"],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  devServer: {
    static: path.join(__dirname, "dist"),
    compress: true,
    port: 4000,
  },
};

export default config;