import React from 'react'
import t from 'tcomb-validation'
import {
  humanize,
  merge,
  getTypeInfo,
  getOptionsOfEnum,
  move,
  UIDGenerator
} from './util'

const Nil = t.Nil
const assert = t.assert
const SOURCE = 'tcomb-form'
const noobj = Object.freeze({})
const noarr = Object.freeze([])
const noop = () => {}

function getFormComponent(type, options) {
  if (options.factory) {
    return options.factory
  }
  if (type.getTcombFormFactory) {
    return type.getTcombFormFactory(options)
  }
  const name = t.getTypeName(type)
  switch (type.meta.kind) {
  case 'irreducible' :
    if (type === t.Boolean) {
      return Checkbox // eslint-disable-line no-use-before-define
    } else if (type === t.Date) {
      return Datetime // eslint-disable-line no-use-before-define
    }
    return Textbox // eslint-disable-line no-use-before-define
  case 'struct' :
    return Struct // eslint-disable-line no-use-before-define
  case 'list' :
    return List // eslint-disable-line no-use-before-define
  case 'enums' :
    return Select // eslint-disable-line no-use-before-define
  case 'maybe' :
  case 'subtype' :
    return getFormComponent(type.meta.type, options)
  default :
    t.fail(`[${SOURCE}] unsupported type ${name}`)
  }
}

exports.getComponent = getFormComponent

function sortByText(a, b) {
  if (a.text < b.text) {
    return -1
  } else if (a.text > b.text) {
    return 1
  }
  return 0
}

function getComparator(order) {
  return {
    asc: sortByText,
    desc: (a, b) => -sortByText(a, b)
  }[order]
}

export const decorators = {

  template(name) {
    return (Component) => {
      Component.prototype.getTemplate = function getTemplate() {
        return this.props.options.template || this.props.ctx.templates[name]
      }
    }
  },

  attrs(Component) {
    Component.prototype.getAttrs = function getAttrs() {
      const attrs = t.mixin({}, this.props.options.attrs)
      attrs.id = this.getId()
      attrs.name = this.getName()
      return attrs
    }
  },

  templates(Component) {
    Component.prototype.getTemplates = function getTemplates() {
      return merge(this.props.ctx.templates, this.props.options.templates)
    }
  }

}

export class Component extends React.Component {

  static transformer = {
    format: value => Nil.is(value) ? null : value,
    parse: value => value
  }

  constructor(props) {
    super(props)
    this.typeInfo = getTypeInfo(props.type)
    this.state = {
      hasError: false,
      value: this.getTransformer().format(props.value)
    }
  }

  getTransformer() {
    return this.props.options.transformer || this.constructor.transformer
  }

  shouldComponentUpdate(nextProps, nextState) {
    const should = (
      nextState.value !== this.state.value ||
      nextState.hasError !== this.state.hasError ||
      nextProps.options !== this.props.options ||
      nextProps.type !== this.props.type
    )
    // console.log(nextState.value !== this.state.value,
    //   nextState.hasError !== this.state.hasError,
    //   nextProps.options !== this.props.options,
    //   nextProps.type !== this.props.type,
    //   should)
    return should
  }

  componentWillReceiveProps(props) {
    if (props.type !== this.props.type) {
      this.typeInfo = getTypeInfo(props.type)
    }
    const value = this.getTransformer().format(props.value)
    this.setState({ value })
  }

  onChange(value) {
    this.setState({ value }, () => {
      this.props.onChange(value, this.props.ctx.path)
    })
  }

  getValidationOptions() {
    const context = this.props.context || this.props.ctx.context
    return {
      path: this.props.ctx.path,
      context: t.mixin(t.mixin({}, context), { options: this.props.options })
    }
  }

  getValue() {
    return this.getTransformer().parse(this.state.value)
  }

  isValueNully() {
    return Nil.is(this.getValue())
  }

  removeErrors() {
    this.setState({ hasError: false })
  }

  validate() {
    const result = t.validate(this.getValue(), this.props.type, this.getValidationOptions())
    this.setState({ hasError: !result.isValid() })
    return result
  }

  getAuto() {
    return this.props.options.auto || this.props.ctx.auto
  }

  getI18n() {
    return this.props.options.i18n || this.props.ctx.i18n
  }

  getDefaultLabel() {
    const label = this.props.ctx.label
    if (label) {
      const suffix = this.typeInfo.isMaybe ? this.getI18n().optional : this.getI18n().required
      return label + suffix
    }
  }

  getLabel() {
    let label = this.props.options.label || this.props.options.legend
    if (Nil.is(label) && this.getAuto() === 'labels') {
      label = this.getDefaultLabel()
    }
    return label
  }

  getError() {
    if (this.hasError()) {
      const error = this.props.options.error || this.typeInfo.getValidationErrorMessage
      if (t.Function.is(error)) {
        const { path, context } = this.getValidationOptions()
        return error(this.getValue(), path, context)
      }
      return error
    }
  }

  hasError() {
    return this.props.options.hasError || this.state.hasError
  }

  getConfig() {
    return merge(this.props.ctx.config, this.props.options.config)
  }

  getId() {
    const attrs = this.props.options.attrs || noobj
    if (attrs.id) {
      return attrs.id
    }
    if (!this.uid) {
      this.uid = this.props.ctx.uidGenerator.next()
    }
    return this.uid
  }

  getName() {
    return this.props.options.name || this.props.ctx.name || this.getId()
  }

  getLocals() {
    const options = this.props.options
    const value = this.state.value
    return {
      typeInfo: this.typeInfo,
      path: this.props.ctx.path,
      error: this.getError(),
      hasError: this.hasError(),
      label: this.getLabel(),
      onChange: this.onChange.bind(this),
      config: this.getConfig(),
      value,
      disabled: options.disabled,
      help: options.help,
      context: this.props.ctx.context
    }
  }

  render() {
    const locals = this.getLocals()
    if (process.env.NODE_ENV !== 'production') {
      // getTemplate is the only required implementation when extending Component
      assert(t.Function.is(this.getTemplate), `[${SOURCE}] missing getTemplate method of component ${this.constructor.name}`)
    }
    const template = this.getTemplate()
    return template(locals)
  }

}

function toNull(value) {
  return (t.String.is(value) && value.trim() === '') || Nil.is(value) ? null : value
}

function parseNumber(value) {
  const n = parseFloat(value)
  const isNumeric = (value - n + 1) >= 0
  return isNumeric ? n : toNull(value)
}

@decorators.attrs
@decorators.template('textbox')
export class Textbox extends Component {

  static transformer = {
    format: value => Nil.is(value) ? null : value,
    parse: toNull
  }

  static numberTransformer = {
    format: value => Nil.is(value) ? null : String(value),
    parse: parseNumber
  }

  getTransformer() {
    const options = this.props.options
    if (options.transformer) {
      return options.transformer
    } else if (this.typeInfo.innerType === t.Number) {
      return Textbox.numberTransformer
    }
    return Textbox.transformer
  }

  getPlaceholder() {
    const attrs = this.props.options.attrs || noobj
    let placeholder = attrs.placeholder
    if (Nil.is(placeholder) && this.getAuto() === 'placeholders') {
      placeholder = this.getDefaultLabel()
    }
    return placeholder
  }

  getLocals() {
    const locals = super.getLocals()
    locals.attrs = this.getAttrs()
    locals.attrs.placeholder = this.getPlaceholder()
    locals.type = this.props.options.type || 'text'
    return locals
  }

}

@decorators.attrs
@decorators.template('checkbox')
export class Checkbox extends Component {

  static transformer = {
    format: value => Nil.is(value) ? false : value,
    parse: value => value
  }

  getLocals() {
    const locals = super.getLocals()
    locals.attrs = this.getAttrs()
    // checkboxes must always have a label
    locals.label = locals.label || this.getDefaultLabel()
    return locals
  }

}

@decorators.attrs
@decorators.template('select')
export class Select extends Component {

  static transformer = (nullOption) => {
    return {
      format: value => Nil.is(value) && nullOption ? nullOption.value : value,
      parse: value => nullOption && nullOption.value === value ? null : value
    }
  }

  static multipleTransformer = {
    format: value => Nil.is(value) ? noarr : value,
    parse: value => value
  }

  getTransformer() {
    const options = this.props.options
    if (options.transformer) {
      return options.transformer
    }
    if (this.isMultiple()) {
      return Select.multipleTransformer
    }
    return Select.transformer(this.getNullOption())
  }

  getNullOption() {
    return this.props.options.nullOption || {value: '', text: '-'}
  }

  isMultiple() {
    return this.typeInfo.innerType.meta.kind === 'list'
  }

  getEnum() {
    return this.isMultiple() ? getTypeInfo(this.typeInfo.innerType.meta.type).innerType : this.typeInfo.innerType
  }

  getOptions() {
    const options = this.props.options
    const items = options.options ? options.options.slice() : getOptionsOfEnum(this.getEnum())
    if (options.order) {
      items.sort(getComparator(options.order))
    }
    const nullOption = this.getNullOption()
    if (!this.isMultiple() && options.nullOption !== false) {
      items.unshift(nullOption)
    }
    return items
  }

  getLocals() {
    const locals = super.getLocals()
    locals.attrs = this.getAttrs()
    locals.options = this.getOptions()
    locals.isMultiple = this.isMultiple()
    return locals
  }

}

@decorators.attrs
@decorators.template('radio')
export class Radio extends Component {

  static transformer = {
    format: value => Nil.is(value) ? null : value,
    parse: value => value
  }

  getOptions() {
    const options = this.props.options
    const items = options.options ? options.options.slice() : getOptionsOfEnum(this.typeInfo.innerType)
    if (options.order) {
      items.sort(getComparator(options.order))
    }
    return items
  }

  getLocals() {
    const locals = super.getLocals()
    locals.attrs = this.getAttrs()
    locals.options = this.getOptions()
    return locals
  }

}

const defaultDatetimeValue = Object.freeze([null, null, null])

@decorators.attrs
@decorators.template('date')
export class Datetime extends Component {

  static transformer = {
    format: (value) => {
      if (t.Array.is(value)) {
        return value
      } else if (t.Date.is(value)) {
        return [value.getFullYear(), value.getMonth(), value.getDate()].map(String)
      }
      return defaultDatetimeValue
    },
    parse: (value) => {
      const numbers = value.map(parseNumber)
      if (numbers.every(t.Number.is)) {
        return new Date(numbers[0], numbers[1], numbers[2])
      } else if (numbers.every(Nil.is)) {
        return null
      }
      return numbers
    }
  }

  getOrder() {
    return this.props.options.order || ['M', 'D', 'YY']
  }

  getLocals() {
    const locals = super.getLocals()
    locals.attrs = this.getAttrs()
    locals.order = this.getOrder()
    return locals
  }

}

@decorators.templates
export class Struct extends Component {

  static transformer = {
    format: value => Nil.is(value) ? noobj : value,
    parse: value => value
  }

  isValueNully() {
    return Object.keys(this.refs).every((ref) => this.refs[ref].isValueNully())
  }

  removeErrors() {
    this.setState({ hasError: false })
    Object.keys(this.refs).forEach((ref) => this.refs[ref].removeErrors())
  }

  getValue() {
    const value = {}
    const props = this.getTypeProps()
    for (const ref in props) {
      if (this.refs.hasOwnProperty(ref)) {
        value[ref] = this.refs[ref].getValue()
      }
    }
    return this.getTransformer().parse(value)
  }

  validate() {
    let value = {}
    let errors = []
    let hasError = false
    let result

    if (this.typeInfo.isMaybe && this.isValueNully()) {
      this.removeErrors()
      return new t.ValidationResult({errors: [], value: null})
    }

    const props = this.getTypeProps()
    for (const ref in props) {
      if (this.refs.hasOwnProperty(ref)) {
        result = this.refs[ref].validate()
        errors = errors.concat(result.errors)
        value[ref] = result.value
      }
    }

    if (errors.length === 0) {
      const InnerType = this.typeInfo.innerType
      value = new InnerType(value)
      if (this.typeInfo.isSubtype && errors.length === 0) {
        result = t.validate(value, this.props.type, this.getValidationOptions())
        hasError = !result.isValid()
        errors = errors.concat(result.errors)
      }
    }

    this.setState({ hasError: hasError })
    return new t.ValidationResult({errors, value})
  }

  onChange(fieldName, fieldValue, path, kind) {
    const value = t.mixin({}, this.state.value)
    value[fieldName] = fieldValue
    this.setState({ value }, () => {
      this.props.onChange(value, path, kind)
    })
  }

  getTemplate() {
    return this.props.options.template || this.getTemplates().struct
  }

  getTypeProps() {
    return this.typeInfo.innerType.meta.props
  }

  getOrder() {
    return this.props.options.order || Object.keys(this.getTypeProps())
  }

  getInputs() {
    const { options, ctx } = this.props
    const props = this.getTypeProps()
    const auto = this.getAuto()
    const i18n = this.getI18n()
    const config = this.getConfig()
    const templates = this.getTemplates()
    const value = this.state.value
    const inputs = {}

    for (const prop in props) {
      if (props.hasOwnProperty(prop)) {
        const propType = props[prop]
        const propOptions = options.fields && options.fields[prop] ? options.fields[prop] : noobj
        inputs[prop] = React.createElement(getFormComponent(propType, propOptions), {
          key: prop,
          ref: prop,
          type: propType,
          options: propOptions,
          value: value[prop],
          onChange: this.onChange.bind(this, prop),
          ctx: {
            context: ctx.context,
            uidGenerator: ctx.uidGenerator,
            auto,
            config,
            name: ctx.name ? `${ctx.name}[${prop}]` : prop,
            label: humanize(prop),
            i18n,
            templates,
            path: ctx.path.concat(prop)
          }
        })
      }
    }
    return inputs
  }

  getLocals() {
    const options = this.props.options
    const locals = super.getLocals()
    locals.order = this.getOrder()
    locals.inputs = this.getInputs()
    locals.className = options.className
    return locals
  }

}

function toSameLength(value, keys, uidGenerator) {
  if (value.length === keys.length) {
    return keys
  }
  const ret = []
  for (let i = 0, len = value.length; i < len; i++ ) {
    ret[i] = keys[i] || uidGenerator.next()
  }
  return ret
}

@decorators.templates
export class List extends Component {

  static transformer = {
    format: value => Nil.is(value) ? noarr : value,
    parse: value => value
  }

  constructor(props) {
    super(props)
    this.state.keys = this.state.value.map(() => props.ctx.uidGenerator.next())
  }

  componentWillReceiveProps(props) {
    if (props.type !== this.props.type) {
      this.typeInfo = getTypeInfo(props.type)
    }
    const value = this.getTransformer().format(props.value)
    this.setState({
      value,
      keys: toSameLength(value, this.state.keys, props.ctx.uidGenerator)
    })
  }

  isValueNully() {
    return this.state.value.length === 0
  }

  removeErrors() {
    this.setState({ hasError: false })
    Object.keys(this.refs).forEach((ref) => this.refs[ref].removeErrors())
  }

  getValue() {
    const value = []
    for (let i = 0, len = this.state.value.length; i < len; i++ ) {
      value.push(this.refs[i].getValue())
    }
    return this.getTransformer().parse(value)
  }

  validate() {
    const value = []
    let errors = []
    let hasError = false
    let result

    if (this.typeInfo.isMaybe && this.isValueNully()) {
      this.removeErrors()
      return new t.ValidationResult({errors: [], value: null})
    }

    for (let i = 0, len = this.state.value.length; i < len; i++ ) {
      result = this.refs[i].validate()
      errors = errors.concat(result.errors)
      value.push(result.value)
    }

    // handle subtype
    if (this.typeInfo.isSubtype && errors.length === 0) {
      result = t.validate(value, this.props.type, this.getValidationOptions())
      hasError = !result.isValid()
      errors = errors.concat(result.errors)
    }

    this.setState({hasError: hasError})
    return new t.ValidationResult({errors: errors, value: value})
  }

  onChange(value, keys, path, kind) {
    const allkeys = toSameLength(value, keys, this.props.ctx.uidGenerator)
    this.setState({ value, keys: allkeys }, () => {
      this.props.onChange(value, path, kind)
    })
  }

  addItem(evt) {
    evt.preventDefault()
    const value = this.state.value.concat(undefined)
    const keys = this.state.keys.concat(this.props.ctx.uidGenerator.next())
    this.onChange(value, keys, this.props.ctx.path.concat(value.length - 1), 'add')
  }

  onItemChange(itemIndex, itemValue, path, kind) {
    const value = this.state.value.slice()
    value[itemIndex] = itemValue
    this.onChange(value, this.state.keys, path, kind)
  }

  removeItem(i, evt) {
    evt.preventDefault()
    const value = this.state.value.slice()
    value.splice(i, 1)
    const keys = this.state.keys.slice()
    keys.splice(i, 1)
    this.onChange(value, keys, this.props.ctx.path.concat(i), 'remove')
  }

  moveUpItem(i, evt) {
    evt.preventDefault()
    if (i > 0) {
      this.onChange(
        move(this.state.value.slice(), i, i - 1),
        move(this.state.keys.slice(), i, i - 1),
        this.props.ctx.path.concat(i),
        'moveUp'
      )
    }
  }

  moveDownItem(i, evt) {
    evt.preventDefault()
    if (i < this.state.value.length - 1) {
      this.onChange(
        move(this.state.value.slice(), i, i + 1),
        move(this.state.keys.slice(), i, i + 1),
        this.props.ctx.path.concat(i),
        'moveDown'
      )
    }
  }

  getTemplate() {
    return this.props.options.template || this.getTemplates().list
  }

  getItems() {
    const { options, ctx } = this.props
    const auto = this.getAuto()
    const i18n = this.getI18n()
    const config = this.getConfig()
    const templates = this.getTemplates()
    const value = this.state.value
    const type = this.typeInfo.innerType.meta.type
    const ItemComponent = getFormComponent(type, options.item || noobj)
    return value.map((itemValue, i) => {
      const buttons = []
      if (!options.disableRemove) {
        buttons.push({
          type: 'remove',
          label: i18n.remove,
          click: this.removeItem.bind(this, i)
        })
      }
      if (!options.disableOrder) {
        buttons.push({
          type: 'move-up',
          label: i18n.up,
          click: this.moveUpItem.bind(this, i)
        })
      }
      if (!options.disableOrder) {
        buttons.push({
          type: 'move-down',
          label: i18n.down,
          click: this.moveDownItem.bind(this, i)
        })
      }
      return {
        input: React.createElement(ItemComponent, {
          ref: i,
          type,
          options: options.item || noobj,
          value: itemValue,
          onChange: this.onItemChange.bind(this, i),
          ctx: {
            context: ctx.context,
            uidGenerator: ctx.uidGenerator,
            auto,
            config,
            i18n,
            name: ctx.name ? `${ctx.name}[${i}]` : String(i),
            templates,
            path: ctx.path.concat(i)
          }
        }),
        key: this.state.keys[i],
        buttons: buttons
      }
    })
  }

  getLocals() {
    const options = this.props.options
    const i18n = this.getI18n()
    const locals = super.getLocals()
    locals.add = options.disableAdd ? null : {
      type: 'add',
      label: i18n.add,
      click: this.addItem.bind(this)
    }
    locals.items = this.getItems()
    locals.className = options.className
    return locals
  }

}

export class Form extends React.Component {

  validate() {
    return this.refs.input.validate()
  }

  getValue() {
    const result = this.validate()
    return result.isValid() ? result.value : null
  }

  getComponent(path) {
    const points = t.String.is(path) ? path.split('.') : path
    return points.reduce((input, name) => input.refs[name], this.refs.input)
  }

  getUIDGenerator() {
    this.uidGenerator = this.uidGenerator || new UIDGenerator(this._reactInternalInstance ? this._reactInternalInstance._rootNodeID : '')
    return this.uidGenerator
  }

  render() {
    const type = this.props.type
    const options = this.props.options || noobj
    const { i18n, templates } = Form

    if (process.env.NODE_ENV !== 'production') {
      assert(t.isType(type), `[${SOURCE}] missing required prop type`)
      assert(t.Object.is(options), `[${SOURCE}] prop options must be an object`)
      assert(t.Object.is(templates), `[${SOURCE}] missing templates config`)
      assert(t.Object.is(i18n), `[${SOURCE}] missing i18n config`)
    }

    // this is in the render method because I need this._reactInternalInstance
    const uidGenerator = this.getUIDGenerator()

    return React.createElement(getFormComponent(type, options), {
      ref: 'input',
      type: type,
      options,
      value: this.props.value,
      onChange: this.props.onChange || noop,
      ctx: this.props.ctx || {
        context: this.props.context,
        uidGenerator,
        auto: 'labels',
        templates,
        i18n,
        path: []
      }
    })
  }

}
