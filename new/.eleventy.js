module.exports = config => {
 
    config.addPassthroughCopy("src/assets", "assets");

    return {
      //pathPrefix: '/new/',
      dir: {
        input: 'src',
        output: 'docs'
      },
    };
  };