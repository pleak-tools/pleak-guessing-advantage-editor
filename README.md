# Pleak guessing advantage editor

This project is the front-end part of the [guessing advantage analysis tool](https://github.com/pleak-tools/pleak-sql-analysis/tree/master/banach) that is a part of the [SQL analysis tool for pleak.io](https://github.com/pleak-tools/pleak-sql-analysis) and [SQL constraint propagation tool](https://github.com/pleak-tools/pleak-sql-constraint-propagation).

## Prerequisites

You need to locate pleak-guessing-advantage-editor, [pleak-backend](https://github.com/pleak-tools/pleak-backend), [pleak-frontend](https://github.com/pleak-tools/pleak-frontend), [pleak-sql-analysis](https://github.com/pleak-tools/pleak-sql-analysis) and [pleak-sql-constraint-propagation](https://github.com/pleak-tools/pleak-sql-constraint-propagation) directories all in the same directory and specify their names in the config.json file.
Read more from sub-repositories how to build each module.

To use all functionalities of the guessing advantage editor:

1) clone the [pleak-sql-analysis](https://github.com/pleak-tools/pleak-sql-analysis) tool and to make the analyzer available for the editor, follow the instructions in the [SQL derivative sensitivity analysis tool repository](https://github.com/pleak-tools/pleak-sql-analysis/tree/master/banach)

2) clone the [pleak-sql-constraint-propagation](https://github.com/pleak-tools/pleak-sql-constraint-propagation) tool and to make the too available for the editor, follow the instructions in the [pleak-sql-constraint-propagation repository](https://github.com/pleak-tools/pleak-sql-constraint-propagation).

## Build

To build the editor you need: NodeJS with npm installed.

To install all project dependencies execute `npm install`.

Execute `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Using

You can use the editor for each model from the Action menu next to the model on Files page (of frontend) or from the URL: http://localhost:8000/guessing-advantage-editor/id (id of the model).

## License

MIT