# <img alt="Data FAIR logo" src="https://cdn.jsdelivr.net/gh/data-fair/data-fair@master/ui/public/assets/logo.svg" width="40"> @data-fair/catalog-s3

A plugin that allows you to build a catalog from a connection to an S3 server.

An S3 server has a specific file and directory structure: everything is at the same level, and it's their name (key) that allows you to build the directory tree.

The most well-known is AWS S3.

### Note
Pagination and search are impossible; both require retrieving all results with each request or page reload, which is not optimized in terms of memory.