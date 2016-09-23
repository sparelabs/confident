const router = require('express').Router()
const safeLoad = require('js-yaml').safeLoad
const fs = require('fs')
const path = require('path')
const pick = require('lodash/pick')
const fromPairs = require('lodash/fromPairs')
const Ajv = require('ajv')
const bodyParser = require('body-parser')

const ajv = new Ajv({ removeAdditional: true })

module.exports = function (options) {
  const yaml = fs.readFileSync(options.definition, 'utf8')
  const definition = safeLoad(yaml)
  router.get('/' + path.basename(options.definition), (req, res) => {
    res.header('Content-Type', 'text/yaml').send(yaml)
  })
  for (let path in definition.paths) {
    for (let method in definition.paths[path]) {
      const methodInfo = definition.paths[path][method]
      const fieldsToPick = [
        'type', 'items', 'exclusiveMaximum', 'minimum', 'exclusiveMinimum',
        'maxLength', 'minLength', 'pattern', 'maxItems', 'minItems',
        'uniqueItems', 'enum', 'multipleOf'
      ]
      const bodyPropertySchemas = (methodInfo.parameters || [])
        .filter(inBody)
        .map((param) => {
          const schema = Object.assign({},
            (param.schema || {}),
            pick(param, fieldsToPick)
          )
          return [param.name, schema]
        })

      const validators = []
      if (bodyPropertySchemas.length) {
        const required = methodInfo.parameters
          .filter((param) => param.required)
          .map((param) => param.name)
        const bodySchema = {
          type: 'object',
          required,
          properties: fromPairs(bodyPropertySchemas)
        }
        const validateBody = ajv.compile(bodySchema)
        validators.push((req, res) => {
          const valid = validateBody(req.body)
          if (!valid) {
            return res.status(400).json(validateBody.errors)
          }
        })
      }

      const validateRequest = (req, res, next) => {
        validators.forEach((validator) => validator(req, res))
        next()
      }

      const routeController = options.operations[methodInfo.operationId]
      router[method](path,
        bodyParser.json(), // TODO: infer parsing middleware from API spec
        validateRequest,
        routeController
      )
    }
  }
  return router
}

const inBody = (parameter) => parameter.in === 'body'
const inPath = (parameter) => parameter.in === 'path'
const inQuery = (parameter) => parameter.in === 'query'
const inFormData = (parameter) => parameter.in === 'formData'
const inHeader = (parameter) => parameter.in === 'header'
