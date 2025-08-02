module.exports = {
  style: {
    postcss: {
      loaderOptions: (postcssLoaderOptions) => {
        postcssLoaderOptions.postcssOptions.plugins = [
          require('tailwindcss/nesting'),
          require('tailwindcss'),
          require('autoprefixer'),
        ];
        return postcssLoaderOptions;
      },
    },
  },
  webpack: {
    configure: (webpackConfig) => {
      // Don't fail on ESLint errors
      webpackConfig.module.rules.forEach((rule) => {
        if (rule.use && rule.use.some((use) => use.loader && use.loader.includes('eslint-loader'))) {
          rule.use.forEach((use) => {
            if (use.loader && use.loader.includes('eslint-loader')) {
              use.options = {
                ...use.options,
                emitWarning: true,
                failOnError: false,
                failOnWarning: false,
              };
            }
          });
        }
      });
      return webpackConfig;
    },
  },
  devServer: {
    client: {
      overlay: {
        errors: false,
        warnings: false,
      },
    },
  },
  eslint: {
    enable: true,
    mode: 'extends',
    configure: {
      rules: {
        'no-unused-vars': 'warn',
        'react-hooks/exhaustive-deps': 'warn',
      },
    },
  },
}; 