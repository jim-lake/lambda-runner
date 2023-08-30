exports.handler = async (event) => {
  console.log(event);
  const response = {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Max-Age': 3000,
    },
    body: { event },
  };
  return response;
};
