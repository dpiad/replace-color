const convertColor = require('./utils/convert-color')
const getDelta = require('./utils/get-delta')
const isNumber = require('./utils/is-number')
const Jimp = require('jimp')
const ReplaceColorError = require('./utils/replace-color-error')
const validateColors = require('./utils/validate-colors')

module.exports = ({
                    image,
                    colors,
                    formula = 'E00',
                    deltaE = 2.3,
                    respectCenterColor = false,
                  } = {}, callback) => {
  if (callback) {
    if (typeof callback !== 'function') {
      throw new ReplaceColorError('PARAMETER_INVALID', 'callback')
    }
  }

  return new Promise((resolve, reject) => {
    callback = callback || ((err, jimpObject) => {
      if (err) return reject(err)
      return resolve(jimpObject)
    })

    if (!image) {
      return callback(new ReplaceColorError('PARAMETER_REQUIRED', 'options.image'))
    }

    const colorsValidationError = validateColors(colors)
    if (colorsValidationError) {
      return callback(new ReplaceColorError(colorsValidationError.code, colorsValidationError.field))
    }

    if (!(typeof formula === 'string' && ['E76', 'E94', 'E00'].includes(formula))) {
      return callback(new ReplaceColorError('PARAMETER_INVALID', 'options.formula'))
    }

    if (!(isNumber(deltaE) && deltaE >= 0 && deltaE <= 100)) {
      return callback(new ReplaceColorError('PARAMETER_INVALID', 'options.deltaE'))
    }

    Jimp.read(image)
      .then((jimpObject) => {
        const targetLABColor = convertColor(colors.type, 'lab', colors.targetColor)
        const replaceRGBColor = convertColor(colors.type, 'rgb', colors.replaceColor)
        const replaceLABColor = convertColor(colors.type, 'lab', colors.replaceColor)

        let matrix = [];
        jimpObject.scan(0, 0, jimpObject.bitmap.width, jimpObject.bitmap.height, (x, y, idx) => {

          if(!respectCenterColor){
            if(canReplacePixel(jimpObject, idx, targetLABColor, replaceLABColor)){
              jimpObject = replacePixel(jimpObject, idx, replaceRGBColor);
            }
          }
          else{
            if(!matrix[x])
              matrix[x] = [];
            matrix[x][y] = idx;
          }
        })

        if(respectCenterColor){
          jimpObject = listInOrder(jimpObject, matrix, targetLABColor, replaceRGBColor, replaceLABColor);
        }

        callback(null, jimpObject)
      })
      .catch(callback)

    function listInOrder(jimpObject, matrix, targetLABColor, replaceRGBColor, replaceLABColor) {
      jimpObject = listFromLeft(jimpObject, matrix, targetLABColor, replaceRGBColor, replaceLABColor);
      jimpObject = listFromRight(jimpObject, matrix, targetLABColor, replaceRGBColor, replaceLABColor);
      jimpObject = listFromTop(jimpObject, matrix, targetLABColor, replaceRGBColor, replaceLABColor);
      jimpObject = listFromBottom(jimpObject, matrix, targetLABColor, replaceRGBColor, replaceLABColor);
      return jimpObject;
    }
    function listFromLeft(jimpObject, matrix, targetLABColor, replaceRGBColor, replaceLABColor) {
      let first = true;
      for(let y = 0; y < jimpObject.bitmap.height; y++)
      {
        for(let x = 0; x < jimpObject.bitmap.width; x++)
        {
          const start = startReplace(jimpObject, matrix[x][y], targetLABColor, replaceLABColor, replaceRGBColor);
          if(start){
            jimpObject = start;
          }
          else{
            break;
          }
        }
      }
      return jimpObject;
    }
    function listFromRight(jimpObject, matrix, targetLABColor, replaceRGBColor, replaceLABColor) {
      for(let y = 0; y < jimpObject.bitmap.height; y++)
      {
        for(let x = jimpObject.bitmap.width - 1; x >= 0; x--)
        {
          const start = startReplace(jimpObject, matrix[x][y], targetLABColor, replaceLABColor, replaceRGBColor);
          if(start){
            jimpObject = start;
          }
          else{
            break;
          }
        }
      }
      return jimpObject;
    }
    function listFromTop(jimpObject, matrix, targetLABColor, replaceRGBColor, replaceLABColor) {
      let first = true;
      for(let x = 0; x < jimpObject.bitmap.width; x++)
      {
        for(let y = 0; y < jimpObject.bitmap.height; y++)
        {
          const start = startReplace(jimpObject, matrix[x][y], targetLABColor, replaceLABColor, replaceRGBColor);
          if(start){
            jimpObject = start;
          }
          else{
            break;
          }
        }
      }
      return jimpObject;
    }
    function listFromBottom(jimpObject, matrix, targetLABColor, replaceRGBColor, replaceLABColor) {
      for(let x = 0; x < jimpObject.bitmap.width; x++)
      {
        for(let y = jimpObject.bitmap.height - 1; y >= 0; y--)
        {
          const start = startReplace(jimpObject, matrix[x][y], targetLABColor, replaceLABColor, replaceRGBColor);
          if(start){
            jimpObject = start;
          }
          else{
            break;
          }
        }
      }
      return jimpObject;
    }

    function startReplace(jimpObject, idx, targetLABColor, replaceLABColor, replaceRGBColor) {
      const canReplace = canReplacePixel(jimpObject, idx, targetLABColor, replaceLABColor);
      if(canReplace){
        if(canReplace === 1)
          jimpObject = replacePixel(jimpObject, idx, replaceRGBColor);
        return jimpObject;
      }
      return false;
    }

    function canReplacePixel(jimpObject, idx, targetLABColor, replaceLABColor) {
      const currentLABColor = convertColor('rgb', 'lab', [
        jimpObject.bitmap.data[idx],
        jimpObject.bitmap.data[idx + 1],
        jimpObject.bitmap.data[idx + 2],
        jimpObject.bitmap.data[idx + 3]
      ]);

      if(equalColor(currentLABColor, replaceLABColor))
        return 2;
      if(getDelta(currentLABColor, targetLABColor, formula) <= deltaE)
        return 1;
      return 0;
    }

    function replacePixel(jimpObject, idx, replaceRGBColor) {
      jimpObject.bitmap.data[idx] = replaceRGBColor[0]
      jimpObject.bitmap.data[idx + 1] = replaceRGBColor[1]
      jimpObject.bitmap.data[idx + 2] = replaceRGBColor[2]
      if (replaceRGBColor[3] !== null) jimpObject.bitmap.data[idx + 3] = replaceRGBColor[3]
      return jimpObject;
    }

    function equalColor(currentLABColor, replaceLABColor) {
      return currentLABColor[0] === replaceLABColor[0] &&
        currentLABColor[1] === replaceLABColor[1] &&
        currentLABColor[2] === replaceLABColor[2] &&
        currentLABColor[3] === replaceLABColor[3];
    }

  })
}
