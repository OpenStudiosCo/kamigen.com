module.exports = function(eleventyConfig) {

  eleventyConfig.addPassthroughCopy("src/assets", "assets");
  eleventyConfig.addPassthroughCopy({
    "./node_modules/alpinejs/dist/cdn.min.js": "./alpine.js",
  });

  return {
    //pathPrefix: '/new/',
    dir: {
      input: 'src',
      output: 'docs'
    },
  };
};
