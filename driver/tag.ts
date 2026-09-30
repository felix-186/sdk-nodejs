// @ts-nocheck
const _ = require("lodash");

const Active_Fixed = "fixed"
const Active_Boundary = "boundary"
const Active_Discard = "discard"
const Active_Latest = "latest"

const InvalidAction_Save = "save"

const ConditionMode_Number = "number"
const ConditionMode_Rate = "rate"
const ConditionMode_Delta = "delta"

const Condition_Range = "range"
const Condition_Greater = "greater"
const Condition_Less = "less"

class ConvertTag {
  /**
   * @name: convert
   * @msg: 数据点缩放转换
   * @param tag
   * @param raw
   */
  convert(tag, raw) {
    if (!_.isNumber(raw)) {
      return raw
    }

    let value = raw
    let {minValue, maxValue, minRaw, maxRaw} = tag.tagValue || {}

    if (!_.isNil(minRaw) && _.isNumber(minRaw) && value < minRaw) {
      value = minRaw
    }
    if (!_.isNil(maxRaw) && _.isNumber(maxRaw) && value > maxRaw) {
      value = maxRaw
    }
    if (!_.isNil(minValue) && !_.isNil(maxValue) && !_.isNil(minRaw) && !_.isNil(maxRaw)) {
      if (maxRaw !== minRaw) {
        value = (((raw - minRaw) / (maxRaw - minRaw)) * (maxValue - minValue)) + minValue
      }
    }
    // if (!_.isNil(tag.fixed) && tag.fixed !== "") {
    //   value = parseFloat(value.toFixed(tag.fixed))
    // }
    if (!_.isNil(tag.mod) && tag.mod !== "") {
      value = value * tag.mod
    }
    return value
  }

  /**
   * @name: convertRange
   * @msg: 数据点边界转换
   * @param range
   * @param preVal
   * @param raw
   */
  convertRange(range, preVal, raw) {
    let newValue = null;
    let rawValue = null;
    let isSave = false;
    let invalidType = "";
    if (!range) {
      newValue = raw
      return {newValue, rawValue, invalidType, isSave}
    }
    if (!_.isNumber(raw)) {
      newValue = raw
      return {newValue, rawValue, invalidType, isSave}
    }
    let {minValue, maxValue, active, fixedValue} = range || {}

    if (!_.isNumber(minValue) || !_.isNumber(maxValue) || !active) {
      switch (range.method) {
        case "valid":
          let {
            newValue, rawValue, isSave
          } = this.convertConditions(range, preVal, raw)
          return {newValue, rawValue, invalidType, isSave}
        case "invalid":
          return this.convertInvalidConditions(range, preVal, raw)
      }

    }

    if (raw >= minValue && raw <= maxValue) {
      newValue = raw
      return {newValue, rawValue, invalidType, isSave}
    }
    switch (active) {
      case Active_Fixed:
        if (!_.isNumber(fixedValue)) {
          newValue = raw
          return {newValue, rawValue, invalidType, isSave}
        }
        newValue = fixedValue
        return {newValue, rawValue, invalidType, isSave}
      case Active_Boundary:
        if (raw < minValue) {
          newValue = minValue
          return {newValue, rawValue, invalidType, isSave}
        }
        if (raw > maxValue) {
          newValue = maxValue
          return {newValue, rawValue, invalidType, isSave}
        }
        break
      case Active_Discard:
        newValue = null
        return {newValue, rawValue, invalidType, isSave}
      case Active_Latest:
        newValue = preVal === null || preVal === undefined ? raw : preVal
        return {newValue, rawValue, invalidType, isSave}
      default:
        newValue = raw
        return {newValue, rawValue, invalidType, isSave}
    }
    newValue = raw
    return {newValue, rawValue, invalidType, isSave}
  }

  convertConditions(tagRange, preVal, raw) {
    let newValue = null;
    let rawValue = null;
    let isSave = true;
    if (!_.isNumber(raw)) {
      newValue = raw
      return {newValue, rawValue, isSave}
    }
    if (tagRange === null || tagRange === undefined) {
      newValue = raw
      return {newValue, rawValue, isSave}
    }

    if (!_.isArray(tagRange.conditions)) {
      newValue = raw
      return {newValue, rawValue, isSave}
    }
    let defaultCondition = null
    for (let i = 0; i < tagRange.conditions.length; i++) {
      let condition = tagRange.conditions[i]
      if (_.isBoolean(condition.defaultCondition) && condition.defaultCondition === true) {
        defaultCondition = condition
      }
      let currentValue = null
      switch (condition.mode) {
        case ConditionMode_Number:
          currentValue = raw
          break
        case ConditionMode_Rate:
          if (!_.isNumber(preVal) || preVal === 0) {
            continue
          }
          currentValue = ((raw - preVal) / preVal) * 100
          break
        case ConditionMode_Delta:
          if (!_.isNumber(preVal)) {
            continue
          }
          currentValue = raw - preVal
          break
      }
      if (currentValue !== null) {
        switch (condition.condition) {
          case Condition_Range:
            if (_.isNumber(condition.minValue) && _.isNumber(condition.maxValue)) {
              if (currentValue >= condition.minValue && currentValue <= condition.maxValue) {
                newValue = raw
                return {newValue, rawValue, isSave}
              }
            }
            break
          case Condition_Greater:
            if (_.isNumber(condition.value)) {
              if (currentValue > condition.value) {
                newValue = raw
                return {newValue, rawValue, isSave}
              }
            }
            break
          case Condition_Less:
            if (_.isNumber(condition.value)) {
              if (currentValue < condition.value) {
                newValue = raw
                return {newValue, rawValue, isSave}
              }
            }
            break
        }
      }
    }
    switch (tagRange.invalidAction) {
      case InvalidAction_Save:
        rawValue = raw
        break;
    }
    switch (tagRange.active) {
      case Active_Fixed:
        if (_.isNumber(tagRange.fixedValue)) {
          newValue = tagRange.fixedValue
        } else {
          newValue = null
        }
        return {newValue, rawValue, isSave}
      case Active_Boundary:
        if (defaultCondition === null) {
          newValue = null
          return {newValue, rawValue, isSave}
        }
        switch (defaultCondition.mode) {
          case ConditionMode_Number:
            switch (defaultCondition.condition) {
              case Condition_Range:
                if (_.isNumber(defaultCondition.minValue) && _.isNumber(defaultCondition.maxValue)) {
                  if (raw < defaultCondition.minValue) {
                    newValue = defaultCondition.minValue
                  } else if (raw > defaultCondition.maxValue) {
                    newValue = defaultCondition.maxValue
                  } else {
                    newValue = null
                  }
                } else {
                  newValue = null
                }
                return {newValue, rawValue, isSave}
              case Condition_Greater:
                newValue = defaultCondition.value
                return {newValue, rawValue, isSave}
              case Condition_Less:
                newValue = defaultCondition.value
                return {newValue, rawValue, isSave}
            }
            break
          case ConditionMode_Rate:
            if (!_.isNumber(preVal) || preVal === 0) {
              newValue = raw
              return {newValue, rawValue, isSave}
            }
            let rateValue = ((raw - preVal) / preVal) * 100
            switch (defaultCondition.condition) {
              case Condition_Range:
                if (_.isNumber(defaultCondition.minValue) && _.isNumber(defaultCondition.maxValue)) {
                  if (rateValue < defaultCondition.minValue) {
                    newValue = (defaultCondition.minValue / 100 + 1) * preVal
                  } else if (rateValue > defaultCondition.maxValue) {
                    newValue = (defaultCondition.maxValue / 100 + 1) * preVal
                  } else {
                    newValue = null
                  }
                } else {
                  newValue = null
                }
                return {newValue, rawValue, isSave}
              case Condition_Greater:
                if (_.isNumber(defaultCondition.value)) {
                  newValue = (defaultCondition.value / 100 + 1) * preVal
                } else {
                  newValue = null
                }
                return {newValue, rawValue, isSave}
              case Condition_Less:
                if (_.isNumber(defaultCondition.value)) {
                  newValue = (defaultCondition.value / 100 + 1) * preVal
                } else {
                  newValue = null
                }
                return {newValue, rawValue, isSave}
            }
            break
          case ConditionMode_Delta:
            if (!_.isNumber(preVal)) {
              newValue = raw
              return {newValue, rawValue, isSave}
            }
            let deltaValue = raw - preVal
            switch (defaultCondition.condition) {
              case Condition_Range:
                if (_.isNumber(defaultCondition.minValue) && _.isNumber(defaultCondition.maxValue)) {
                  if (deltaValue < defaultCondition.minValue) {
                    newValue = defaultCondition.minValue + preVal
                  } else if (deltaValue > defaultCondition.maxValue) {
                    newValue = defaultCondition.maxValue + preVal
                  } else {
                    newValue = null
                  }
                } else {
                  newValue = null
                }
                return {newValue, rawValue, isSave}
              case Condition_Greater:
                if (_.isNumber(defaultCondition.value)) {
                  newValue = defaultCondition.value + preVal
                } else {
                  newValue = null
                }
                return {newValue, rawValue, isSave}
              case Condition_Less:
                if (_.isNumber(defaultCondition.value)) {
                  newValue = defaultCondition.value + preVal
                } else {
                  newValue = null
                }
                return {newValue, rawValue, isSave}
            }
            break
        }
        break
      case Active_Discard:
        newValue = null
        return {newValue, rawValue, isSave}
      case Active_Latest:
        if (preVal === null || preVal === undefined) {
          newValue = raw
        } else {
          newValue = preVal
        }
        return {newValue, rawValue, isSave}
    }
    return {newValue, rawValue, isSave}
  }

  convertInvalidConditions(tagRange, preVal, raw) {
    let newValue = null;
    let rawValue = null;
    let invalidType = "";
    let isSave = true;
    if (!_.isNumber(raw)) {
      newValue = raw
      return {newValue, rawValue, invalidType, isSave}
    }
    if (tagRange === null || tagRange === undefined) {
      newValue = raw
      return {newValue, rawValue, invalidType, isSave}
    }

    if (!_.isArray(tagRange.conditions)) {
      newValue = raw
      return {newValue, rawValue, invalidType, isSave}
    }
    loop:for (let i = 0; i < tagRange.conditions.length; i++) {
      let condition = tagRange.conditions[i]
      let currentValue = null
      switch (condition.mode) {
        case ConditionMode_Number:
          currentValue = raw
          break
        case ConditionMode_Rate:
          if (!_.isNumber(preVal) || preVal === 0) {
            continue
          }
          currentValue = ((raw - preVal) / preVal) * 100
          break
        case ConditionMode_Delta:
          if (!_.isNumber(preVal)) {
            continue
          }
          currentValue = raw - preVal
          break
      }
      if (currentValue !== null) {
        switch (condition.condition) {
          case Condition_Range:
            if (_.isNumber(condition.minValue) && _.isNumber(condition.maxValue)) {
              if (currentValue >= condition.minValue && currentValue <= condition.maxValue) {
                rawValue = raw
                invalidType = condition.invalidType
                break loop
              }
            }
            break
          case Condition_Greater:
            if (_.isNumber(condition.value)) {
              if (currentValue > condition.value) {
                rawValue = raw
                invalidType = condition.invalidType
                break loop
              }
            }
            break
          case Condition_Less:
            if (_.isNumber(condition.value)) {
              if (currentValue < condition.value) {
                rawValue = raw
                invalidType = condition.invalidType
                break loop
              }
            }
            break
        }
      }
    }
    if (rawValue !== null) {
      switch (tagRange.invalidAction) {
        case InvalidAction_Save:
          break;
        default:
          rawValue = null;
          break;
      }
      switch (tagRange.active) {
        case Active_Fixed:
          if (_.isNumber(tagRange.fixedValue)) {
            newValue = tagRange.fixedValue
          } else {
            newValue = null
          }
          return {newValue, rawValue, invalidType, isSave}
        case Active_Discard:
          newValue = null
          return {newValue, rawValue, invalidType, isSave}
        case Active_Latest:
          if (preVal === null || preVal === undefined) {
            newValue = raw
          } else {
            newValue = preVal
          }
          return {newValue, rawValue, invalidType, isSave}
      }
    } else {
      newValue = raw
    }

    return {newValue, rawValue, invalidType, isSave}
  }

  valueFormat(tag, value) {
    if (!tag) {
      return value;
    }
    if (!_.isNumber(value)){
      return value;
    }
    return this.valueFloat(tag, value);
  }

  valueFloat(tag, value) {
    let fixed = 3;  // Default decimal places
    if (tag.fixed !== undefined) {
      fixed = tag.fixed;
    }

    switch (tag['baseValFormat']) {
      case 'round': // 四舍五入
        return this.roundValue(value, fixed);
      case 'carryUp': // 向上进位
        return this.carryUpValue(value, fixed);
      case 'slice': // 按位展示
        return this.sliceNum(value, fixed);
      default:
        if (tag.fixed !== undefined && tag.fixed !== null) {
          return this.roundValue(value, tag.fixed);
        }
    }
    return value;
  }

  roundValue(value, fixed) {
    const factor = Math.pow(10, fixed);
    return Math.round(value * factor) / factor;
  }

  carryUpValue(value, fixed) {
    const factor = Math.pow(10, fixed);
    return Math.ceil(value * factor) / factor;
  }

  sliceNum(number, fixed) {
    let numberStr = number.toString();

    // Find the decimal point
    const indexOfDecimal = numberStr.indexOf('.');

    if (indexOfDecimal !== -1) {
      // Calculate the slicing position
      const sliceEnd = indexOfDecimal + fixed + 1;
      numberStr = numberStr.slice(0, sliceEnd);
    }

    // Convert the sliced string back to a float
    const result = parseFloat(numberStr);
    if (isNaN(result)) {
      console.error('转换错误:', result);
      return 0;
    }

    return result;
  }

}


export = ConvertTag
